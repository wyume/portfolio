/* ============================================================
   doc-db.js — 统一 IndexedDB 连接模块
   为 script.js / prod-upload.js 提供共享的 IndexedDB 实例，
   避免多个独立连接导致的重复初始化开销。
   当前使用数据库：ProdImagesDB（兼容已有数据）
   ============================================================ */

(function () {
  'use strict';

  var DB_NAME = 'ProdImagesDB';
  var DB_VERSION = 1;
  var _db = null;
  var _queue = [];

  function openDB(callback) {
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function (e) {
      if (!e.target.result.objectStoreNames.contains('imgs')) {
        e.target.result.createObjectStore('imgs');
      }
    };
    req.onsuccess = function (e) {
      _db = e.target.result;
      // 消费排队中的操作
      var q = _queue.slice();
      _queue = [];
      for (var i = 0; i < q.length; i++) {
        try { q[i](_db); } catch (ee) {}
      }
      if (callback) callback(_db);
    };
    req.onerror = function () {
      _db = null;
      if (callback) callback(null);
    };
  }

  /** 获取数据库实例（若尚未打开则排队等待） */
  function getDB(callback) {
    if (_db) {
      callback(_db);
    } else {
      _queue.push(callback);
      // 仅在第一次排队时触发 open
      if (_queue.length === 1) {
        openDB();
      }
    }
  }

  /** 保存数据到 IndexedDB */
  function save(key, data) {
    getDB(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction('imgs', 'readwrite');
        tx.objectStore('imgs').put(data, key);
      } catch (ee) {}
    });
  }

  /** 从 IndexedDB 加载数据 */
  function load(key, callback) {
    getDB(function (db) {
      if (!db) { callback([]); return; }
      try {
        var tx = db.transaction('imgs', 'readonly');
        var req = tx.objectStore('imgs').get(key);
        req.onsuccess = function () { callback(req.result || []); };
        req.onerror = function () { callback([]); };
      } catch (ee) {
        callback([]);
      }
    });
  }

  /** 从 IndexedDB 删除数据 */
  function remove(key) {
    getDB(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction('imgs', 'readwrite');
        tx.objectStore('imgs').delete(key);
      } catch (ee) {}
    });
  }

  // 暴露全局 API
  window._docDB = {
    getDB: getDB,
    save: save,
    load: load,
    remove: remove,
    DB_NAME: DB_NAME
  };

})();
