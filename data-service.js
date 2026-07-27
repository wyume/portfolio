/* ============================================================
   data-service.js — Supabase Cloud Data Service
   提供云端存储 API，localStorage/IndexedDB 作为离线缓存。

   API:
     DS.saveContent(key, value)           → Promise
     DS.loadContent(key)                  → Promise<any>
     DS.uploadCompressedImage(b64,cat,k)  → Promise<string> (URL)
     DS.uploadFile(file, cat, k)          → Promise<string> (URL)
     DS.listFiles(cat, k)                 → Promise<Array>
     DS.deleteFile(cat, k, filename)      → Promise
     DS.migrateFromLocal(onProgress)      → Promise<{total,migrated}>
     DS.isOnline()                        → boolean

   存储路径: {category}/{key}/{timestamp}_{filename}
     category: "prod" | "sln" | "doc" | "design"
   ============================================================ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://gvnzxuldnbdrsvclvuul.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_dTms1JmEP3yG9MoNI32y-Q_GI9bUjAg';
  var BUCKET = 'portfolio-files';
  var TABLE = 'portfolio_content';
  var CACHE_PREFIX = '_sc_';

  var _online = navigator.onLine !== false;
  window.addEventListener('online', function () { _online = true; });
  window.addEventListener('offline', function () { _online = false; });

  /* ---- Supabase REST 帮助函数 ---- */
  function apiURL(path) {
    return SUPABASE_URL + path;
  }
  function apiHeaders(extra) {
    var h = {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY
    };
    if (extra) { for (var k in extra) { h[k] = extra[k]; } }
    return h;
  }

  /* ---- 内容 API（文本数据）---- */
  function saveContent(key, value) {
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)); } catch (e) { }
    if (!_online) return Promise.resolve();

    var payload = { key: key, value: value, updated_at: new Date().toISOString() };
    // 先尝试 PATCH（更新已存在的行）
    return fetch(
      apiURL('/rest/v1/' + TABLE + '?key=eq.' + encodeURIComponent(key)),
      { method: 'PATCH', headers: apiHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }), body: JSON.stringify(payload) }
    ).then(function (r) {
      if (r.ok) return;
      // 行可能不存在，尝试 POST（插入）
      return fetch(
        apiURL('/rest/v1/' + TABLE),
        { method: 'POST', headers: apiHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }), body: JSON.stringify(payload) }
      );
    }).catch(function () { /* 静默失败，localStorage 已有备份 */ });
  }

  function loadContent(key) {
    if (!_online) return Promise.resolve(_loadLocal(key));

    return fetch(
      apiURL('/rest/v1/' + TABLE + '?key=eq.' + encodeURIComponent(key) + '&select=value&limit=1'),
      { headers: apiHeaders() }
    ).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (rows) {
      if (rows && rows.length > 0 && rows[0].value != null) {
        try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(rows[0].value)); } catch (e) { }
        return rows[0].value;
      }
      throw new Error('not found');
    }).catch(function () {
      return _loadLocal(key);
    });
  }

  function _loadLocal(key) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + key);
      if (raw) return JSON.parse(raw);
    } catch (e) { }
    return null;
  }

  /* ---- 文件 API ---- */
  function _safeName(name) {
    return (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200);
  }

  function uploadCompressedImage(base64DataUrl, category, key, originalName) {
    if (!_online) return Promise.reject(new Error('Offline'));

    var parts = base64DataUrl.split(',');
    var mime = (parts[0].match(/data:(.*);base64/) || ['', 'image/jpeg'])[1];
    var binary = atob(parts[1]);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
    var blob = new Blob([bytes], { type: mime });

    var safeName = _safeName(originalName || 'image.jpg');
    var path = category + '/' + key + '/' + Date.now() + '_' + safeName;

    return fetch(
      apiURL('/storage/v1/object/' + BUCKET + '/' + path),
      { method: 'POST', headers: apiHeaders({ 'Content-Type': mime, 'x-upsert': 'false' }), body: blob }
    ).then(function (r) {
      if (!r.ok) throw new Error('Upload failed: HTTP ' + r.status);
      return apiURL('/storage/v1/object/public/' + BUCKET + '/' + path);
    });
  }

  function uploadFile(file, category, key) {
    if (!_online) return Promise.reject(new Error('Offline'));

    var safeName = _safeName(file.name);
    var path = category + '/' + key + '/' + Date.now() + '_' + safeName;

    return fetch(
      apiURL('/storage/v1/object/' + BUCKET + '/' + path),
      { method: 'POST', headers: apiHeaders({ 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }), body: file }
    ).then(function (r) {
      if (!r.ok) throw new Error('Upload failed: HTTP ' + r.status);
      return apiURL('/storage/v1/object/public/' + BUCKET + '/' + path);
    });
  }

  function listFiles(category, key) {
    if (!_online) return Promise.resolve([]);

    var prefix = category + '/' + key + '/';
    return fetch(
      apiURL('/storage/v1/object/list/' + BUCKET + '?prefix=' + encodeURIComponent(prefix)),
      { headers: apiHeaders() }
    ).then(function (r) {
      if (!r.ok) throw new Error('List failed');
      return r.json();
    }).then(function (data) {
      if (!data || !Array.isArray(data)) return [];
      return data.map(function (item) {
        return {
          name: item.name,
          path: prefix + item.name,
          url: apiURL('/storage/v1/object/public/' + BUCKET + '/' + prefix + item.name),
          size: item.metadata ? item.metadata.size : 0
        };
      });
    }).catch(function () { return []; });
  }

  function deleteFile(category, key, filename) {
    if (!_online) return Promise.reject(new Error('Offline'));

    var path = category + '/' + key + '/' + filename;
    return fetch(
      apiURL('/storage/v1/object/' + BUCKET + '/' + path),
      { method: 'DELETE', headers: apiHeaders() }
    );
  }

  /* ---- 本地 → 云端迁移 ---- */
  function migrateFromLocal(onProgress) {
    var total = 0, migrated = 0;
    var CONTENT_KEYS = [
      '_custom_sec_titles', '_custom_prod_descs', '_custom_prod_metrics',
      '_custom_sln_data', '_custom_sln_titles', '_custom_sln_chips',
      '_custom_sln_card_descs', '_custom_mgmt_titles', '_custom_mgmt_descs',
      '_custom_mgmt_steps', '_custom_doc_titles', '_custom_doc_items',
      '_custom_doc_descs', '_custom_design_cats', '_custom_design_items',
      '_design_desc'
    ];

    var promises = [];

    // 迁移文本内容
    CONTENT_KEYS.forEach(function (k) {
      try {
        var raw = localStorage.getItem(k);
        if (raw) {
          total++;
          promises.push(
            saveContent(k, JSON.parse(raw)).then(function () {
              migrated++;
              if (onProgress) onProgress(migrated, total);
            })
          );
        }
      } catch (e) { }
    });

    return Promise.allSettled(promises).then(function () {
      if (total > 0) { try { localStorage.setItem('_migration_done', '1'); } catch (e) { } }
      return { total: total, migrated: migrated };
    });
  }

  /* ---- 公开 API ---- */
  window.DS = {
    saveContent: saveContent,
    loadContent: loadContent,
    uploadCompressedImage: uploadCompressedImage,
    uploadFile: uploadFile,
    listFiles: listFiles,
    deleteFile: deleteFile,
    migrateFromLocal: migrateFromLocal,
    isOnline: function () { return _online; }
  };

})();
