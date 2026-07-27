/**
 * Portfolio Analytics Tracker
 * 埋点追踪脚本 — 上报至 Supabase
 *
 * 部署说明：
 *   1. 在 Supabase 创建项目并执行建表 SQL
 *   2. 将下方的 SUPABASE_URL 和 SUPABASE_KEY 替换为你的实际值
 *   3. 确保 index.html 已引入本脚本（<script async src="analytics-tracker.js"></script>）
 */

(function() {
  'use strict';

  // ============================================================
  // 配置（部署时替换为实际值）
  // ============================================================
  var CFG = {
    supabaseUrl: 'https://gvnzxuldnbdrsvclvuul.supabase.co',
    supabaseKey: 'sb_publishable_dTms1JmEP3yG9MoNI32y-Q_GI9bUjAg',
    batchInterval: 5000,     // 每 5 秒批量上报
    batchMaxSize: 10,       // 或累积 10 条时上报
    heartbeatInterval: 30000, // 每 30 秒心跳更新在线时长
    debug: false             // 开发时设为 true 可在控制台看到上报日志
  };

  // ============================================================
  // 内部状态
  // ============================================================
  var sessionId;
  var visitorId;
  var deviceInfo;
  var eventQueue = [];
  var sectionTimers = {};
  var currentSection = null;
  var sessionStartTime = Date.now();
  var heartbeatTimer = null;
  var flushTimer = null;

  // ============================================================
  // UID 生成
  // ============================================================
  function uid(len) {
    len = len || 12;
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for (var i = 0; i < len; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function getOrCreateVisitorId() {
    try {
      var id = localStorage.getItem('_av_id');
      if (!id) {
        id = 'v_' + Date.now().toString(36) + '_' + uid(8);
        localStorage.setItem('_av_id', id);
      }
      return id;
    } catch (e) {
      return 'v_' + uid(16);
    }
  }

  function createSessionId() {
    return 's_' + Date.now().toString(36) + '_' + uid(6);
  }

  // ============================================================
  // 设备信息检测（详细版 — 品牌/型号/设备名）
  // ============================================================
  function captureDeviceInfo() {
    var ua = navigator.userAgent || '';
    var platform = navigator.platform || '';

    // --- 设备类型 ---
    var deviceType = 'desktop';
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
      deviceType = (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobi/i.test(ua)))
        ? 'tablet' : 'mobile';
    }

    // --- 操作系统（详细版） ---
    var os = 'Other';
    var osVersion = '';
    var architecture = ''; // 64-bit / 32-bit
    if (/Windows NT 10\.0/i.test(ua)) {
      os = 'Windows 10/11';
      // 尝试区分 Win10 vs Win11（Win11 在 UA 中也是 NT 10.0）
      if (/Windows NT 10\.0;.*?Win64.*?22H2/i.test(ua) || /Windows NT 10\.0;.*?Win64.*?23H2/i.test(ua)) {
        os = 'Windows 11';
      } else {
        os = 'Windows 10';
      }
    } else if (/Windows NT 6\.3/i.test(ua)) { os = 'Windows 8.1'; }
    else if (/Windows NT 6\.2/i.test(ua)) { os = 'Windows 8'; }
    else if (/Windows NT 6\.1/i.test(ua)) { os = 'Windows 7'; }
    else if (/Windows/i.test(ua)) { os = 'Windows'; }
    else if (/Mac OS X 15/i.test(ua) || /Mac OS X 14/i.test(ua)) { os = 'macOS Sequoia'; }
    else if (/Mac OS X 14/i.test(ua)) { os = 'macOS Sonoma'; }
    else if (/Mac OS X 13/i.test(ua)) { os = 'macOS Ventura'; }
    else if (/Mac OS X 12/i.test(ua)) { os = 'macOS Monterey'; }
    else if (/Mac/i.test(ua)) { os = 'macOS'; }
    else if (/Android\s(\d+(\.\d+)?)/i.test(ua)) {
      var av = ua.match(/Android\s(\d+(\.\d+)?)/i);
      os = 'Android ' + (av ? av[1] : '');
    } else if (/Android/i.test(ua)) { os = 'Android'; }
    else if (/iPhone|iPad|iPod/i.test(ua)) { os = 'iOS'; }
    else if (/Linux/i.test(ua) && !/Android/i.test(ua)) { os = 'Linux'; }

    // 架构检测（64-bit / 32-bit）
    if (/x64|x86_64|Win64|WOW64|amd64/i.test(ua)) {
      architecture = '64-bit';
    } else if (/i386|i686|x86/i.test(ua) && !/x64|x86_64/i.test(ua)) {
      architecture = '32-bit';
    }

    // --- 浏览器（详细检测，优先匹配特征浏览器） ---
    var browser = 'Other';
    var browserVersion = '';
    if (/SogouExplorer|MetaSr|SE\s2\./i.test(ua)) browser = 'Sogou';
    else if (/QQBrowser|MQQBrowser/i.test(ua)) browser = 'QQ Browser';
    else if (/UCBrowser|UCWEB|UBrowser/i.test(ua)) browser = 'UC Browser';
    else if (/360SE|360EE|QIHU|360Browser/i.test(ua)) browser = '360 Browser';
    else if (/MicroMessenger/i.test(ua)) browser = 'WeChat';
    else if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
    else if (/Brave/i.test(ua)) browser = 'Brave';
    else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
    else if (/CriOS/i.test(ua)) browser = 'Chrome (iOS)';
    else if (/Chrome\//i.test(ua)) browser = 'Chrome';
    else if (/Safari\//i.test(ua)) browser = 'Safari';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Trident|MSIE/i.test(ua)) browser = 'IE';

    // --- 品牌 & 型号解析 ---
    var brand = 'Unknown';
    var model = 'Unknown';
    var deviceName = 'Unknown Device';

    if (os === 'iOS') {
      brand = 'Apple';
      if (/iPad/i.test(ua)) {
        model = 'iPad';
        deviceName = 'Apple iPad';
      } else if (/iPhone/i.test(ua)) {
        model = 'iPhone';
        deviceName = 'Apple iPhone';
      } else if (/iPod/i.test(ua)) {
        model = 'iPod';
        deviceName = 'Apple iPod';
      }
      // 尝试通过屏幕分辨率推测具体型号
      var sw = screen.width || 0;
      var sh = screen.height || 0;
      var max = Math.max(sw, sh);
      var min = Math.min(sw, sh);
      if (max === 2796 && min === 1290) { model = 'iPhone 15 Pro Max'; deviceName = 'Apple iPhone 15 Pro Max'; }
      else if (max === 2556 && min === 1179) { model = 'iPhone 15 Pro'; deviceName = 'Apple iPhone 15 Pro'; }
      else if (max === 2532 && min === 1170) { model = 'iPhone 14'; deviceName = 'Apple iPhone 14'; }
      else if (max === 2778 && min === 1284) { model = 'iPhone 14 Pro Max'; deviceName = 'Apple iPhone 14 Pro Max'; }
      else if (max === 2556 && min === 1179) { model = 'iPhone 14 Pro'; deviceName = 'Apple iPhone 14 Pro'; }
      else if (max === 2340 && min === 1080) { model = 'iPhone 13 / 14'; deviceName = 'Apple iPhone 13/14'; }
      else if (max === 2532 && min === 1170) { model = 'iPhone 13'; deviceName = 'Apple iPhone 13'; }
      else if (max === 2778 && min === 1284) { model = 'iPhone 12 Pro Max'; deviceName = 'Apple iPhone 12 Pro Max'; }
      else if (max === 2732 && min === 2048) { model = 'iPad Pro 12.9"'; deviceName = 'Apple iPad Pro 12.9"'; }
      else if (max === 2388 && min === 1668) { model = 'iPad Pro 11"'; deviceName = 'Apple iPad Pro 11"'; }
      else if (max === 2160 && min === 1620) { model = 'iPad 10'; deviceName = 'Apple iPad'; }
      else if (max >= 1640 && min >= 2360) { model = 'iPad'; deviceName = 'Apple iPad'; }
    } else if (os === 'Android') {
      // 从 UA 提取 Android 设备型号
      // 常见格式: "; [Model Name] Build/" 或 "; SM-XXXX Build/"
      var modelMatch = ua.match(/;\s*([\w\-\+\. ]+(?:SM-[\w]+|HMA-[\w]+|Pixel[\s\w]*|Redmi[\s\w]*|Mi[\s\w]+|Poco[\s\w]+|OnePlus[\s\w]+|vivo[\s\w]+|OPPO[\s\w]+|HUAWEI[\s\w]+|HONOR[\s\w]+|realme[\s\w]+|Nothing[\s\w]+)[\w\-\+\. ]*)\s*(?:Build|\))/i);
      if (!modelMatch) {
        // 备选: 尝试匹配 Build/model 格式
        modelMatch = ua.match(/;?\s*([\w\-]+(?:\s[\w\-]+){0,3})\s+Build\//);
      }
      if (modelMatch && modelMatch[1]) {
        model = modelMatch[1].trim();
        // 去除版本号后缀
        model = model.replace(/\s+Build.*$/, '');
      }

      // 品牌识别
      if (/Samsung|SM-|Galaxy/i.test(ua)) {
        brand = 'Samsung';
      } else if (/HUAWEI|HMA-|ELS-|NOH-|OCE-/i.test(ua)) {
        brand = 'Huawei';
      } else if (/HONOR/i.test(ua)) {
        brand = 'Honor';
      } else if (/Xiaomi|Redmi|Mi\s|Poco|M\d{4}/i.test(ua)) {
        brand = 'Xiaomi';
      } else if (/OPPO|CPH\d+|PCLM/i.test(ua)) {
        brand = 'OPPO';
      } else if (/vivo|V\d{4}/i.test(ua) && !/Xiaomi/i.test(ua)) {
        brand = 'vivo';
      } else if (/OnePlus|LE\d{4}|KB\d{4}/i.test(ua)) {
        brand = 'OnePlus';
      } else if (/Pixel/i.test(ua)) {
        brand = 'Google';
      } else if (/realme/i.test(ua)) {
        brand = 'realme';
      } else if (/Nothing/i.test(ua)) {
        brand = 'Nothing';
      } else if (/motorola|moto/i.test(ua)) {
        brand = 'Motorola';
      } else {
        brand = 'Android';
      }

      if (model === 'Unknown' || model === '') {
        model = brand + ' Device';
      }
      deviceName = brand + (model ? ' ' + model : '');
    } else if (os === 'macOS') {
      brand = 'Apple';
      model = 'Mac';
      // 尝试通过屏幕分辨率和 platform 判断
      if (/MacBook/i.test(ua) || (platform && /MacIntel/i.test(platform))) {
        var sw2 = screen.width || 0;
        if (sw2 >= 3456) { model = 'MacBook Pro 16"'; deviceName = 'Apple MacBook Pro 16"'; }
        else if (sw2 >= 3024) { model = 'MacBook Pro 14"'; deviceName = 'Apple MacBook Pro 14"'; }
        else if (sw2 >= 2560) { model = 'MacBook Pro 13"'; deviceName = 'Apple MacBook Pro 13"'; }
        else if (sw2 >= 2880) { model = 'MacBook Air 15"'; deviceName = 'Apple MacBook Air 15"'; }
        else { model = 'Mac'; deviceName = 'Apple Mac'; }
      } else {
        // iMac or external display
        if (sw2 >= 5120) { model = 'iMac 5K'; deviceName = 'Apple iMac 5K'; }
        else { model = 'Mac Desktop'; deviceName = 'Apple Mac Desktop'; }
      }
    } else if (/Windows/i.test(os)) {
      // 桌面 Windows 浏览器不暴露品牌/型号，只能从 UA 识别少数品牌机
      brand = 'Unknown';
      model = 'Unknown';
      deviceName = 'Windows Desktop';
      if (/Surface/i.test(ua)) { brand = 'Microsoft'; model = 'Surface'; deviceName = 'Microsoft Surface'; }
      else if (/ThinkPad|ThinkCentre/i.test(ua)) { brand = 'Lenovo'; model = ua.match(/(ThinkPad[\s\w]*|ThinkCentre[\s\w]*)/i)?.[1] || 'ThinkPad'; deviceName = 'Lenovo ' + model; }
      else if (/Dell/i.test(ua)) { brand = 'Dell'; model = 'Unknown'; deviceName = 'Dell Desktop'; }
      else if (/HP\s|Hewlett-Packard|hp\s/i.test(ua)) { brand = 'HP'; model = 'Unknown'; deviceName = 'HP Desktop'; }
      else if (/ASUS/i.test(ua)) { brand = 'ASUS'; model = 'Unknown'; deviceName = 'ASUS Desktop'; }
      else if (/Acer/i.test(ua)) { brand = 'Acer'; model = 'Unknown'; deviceName = 'Acer Desktop'; }
      else if (/Lenovo/i.test(ua)) { brand = 'Lenovo'; model = 'Unknown'; deviceName = 'Lenovo Desktop'; }
    } else if (/Linux/i.test(os)) {
      brand = 'Other';
      model = 'Linux Desktop';
      deviceName = 'Linux Desktop';
    }

    // 清理 deviceName 中的多余空格
    deviceName = deviceName.replace(/\s+/g, ' ').trim();
    model = model.replace(/\s+/g, ' ').trim();

    // 用户自定义设备信息（优先于自动检测）
    try {
      var customLabel = localStorage.getItem('_av_label');
      var customBrand = localStorage.getItem('_av_brand');
      var customModel = localStorage.getItem('_av_model');
      if (customLabel) deviceName = customLabel.trim();
      if (customBrand) brand = customBrand.trim();
      if (customModel) model = customModel.trim();
    } catch(e) {}

    // 构建详细 OS 字符串
    var osDetail = os;
    if (architecture) osDetail += ' · ' + architecture;

    return {
      device_type: deviceType,
      device_brand: brand,
      device_model: model,
      device_name: deviceName,
      os: osDetail,
      browser: browser,
      screen_width: screen.width || 0,
      screen_height: screen.height || 0,
      viewport_width: window.innerWidth || 0,
      viewport_height: window.innerHeight || 0,
      language: (navigator.language || '').substring(0, 10),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      referrer: document.referrer || ''
    };
  }

  // ============================================================
  // Supabase REST API 调用
  // ============================================================
  function supabaseURL(table) {
    return CFG.supabaseUrl + '/rest/v1/' + table;
  }

  function supabaseHeaders(extra) {
    var h = {
      'Content-Type': 'application/json',
      'apikey': CFG.supabaseKey,
      'Authorization': 'Bearer ' + CFG.supabaseKey,
      'Prefer': 'return=minimal'
    };
    if (extra) {
      for (var k in extra) { h[k] = extra[k]; }
    }
    return h;
  }

  function apiPost(table, body, onOk, onErr) {
    fetch(supabaseURL(table), {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify(body)
    }).then(function(r) {
      if (!r.ok && CFG.debug) console.error('[Tracker] POST ' + table + ' failed:', r.status);
      if (onOk) onOk(r);
    }).catch(function(e) {
      if (CFG.debug) console.error('[Tracker] POST ' + table + ' error:', e);
      if (onErr) onErr(e);
    });
  }

  function apiPatch(table, body, queryParam) {
    var url = supabaseURL(table) + '?' + queryParam;
    fetch(url, {
      method: 'PATCH',
      headers: supabaseHeaders({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify(body)
    }).catch(function(e) {
      if (CFG.debug) console.error('[Tracker] PATCH ' + table + ' error:', e);
    });
  }

  // ============================================================
  // Session 管理
  // ============================================================
  function sendSessionStart() {
    var payload = {
      session_id: sessionId,
      visitor_id: visitorId,
      start_time: new Date().toISOString(),
      device_type: deviceInfo.device_type,
      device_brand: deviceInfo.device_brand,
      device_model: deviceInfo.device_model,
      device_name: deviceInfo.device_name,
      os: deviceInfo.os,
      browser: deviceInfo.browser,
      screen_width: deviceInfo.screen_width,
      screen_height: deviceInfo.screen_height,
      viewport_width: deviceInfo.viewport_width,
      viewport_height: deviceInfo.viewport_height,
      language: deviceInfo.language,
      timezone: deviceInfo.timezone,
      referrer: deviceInfo.referrer,
      page_count: 1
    };
    apiPost('sessions', payload);
  }

  function sendHeartbeat() {
    var duration = Math.round((Date.now() - sessionStartTime) / 1000);
    apiPatch(
      'sessions',
      { duration_seconds: duration },
      'session_id=eq.' + encodeURIComponent(sessionId)
    );
  }

  function sendSessionEnd() {
    var duration = Math.round((Date.now() - sessionStartTime) / 1000);
    var payload = {
      end_time: new Date().toISOString(),
      duration_seconds: duration
    };

    // 用 sendBeacon 确保页面关闭时也能发出
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon(
      supabaseURL('sessions') + '?session_id=eq.' + encodeURIComponent(sessionId),
      blob
    );

    // 同时刷新剩余事件队列
    if (eventQueue.length > 0) {
      var batch = eventQueue.splice(0, eventQueue.length);
      var eventsBlob = new Blob(
        [JSON.stringify(batch.map(function(e) { e.session_id = sessionId; return e; }))],
        { type: 'application/json' }
      );
      navigator.sendBeacon(supabaseURL('events'), eventsBlob);
    }
  }

  // ============================================================
  // Pageview 上报
  // ============================================================
  function sendPageview() {
    var payload = {
      session_id: sessionId,
      page_url: window.location.href,
      page_title: document.title || '',
      referrer: document.referrer || '',
      load_time_ms: Math.round(performance.now ? performance.now() : 0)
    };
    apiPost('pageviews', payload);
  }

  // ============================================================
  // 事件队列与批量上报
  // ============================================================
  function enqueueEvent(evt) {
    evt.session_id = sessionId;
    evt.viewport_w = window.innerWidth;
    evt.viewport_h = window.innerHeight;
    evt.scroll_y = Math.round(window.scrollY || window.pageYOffset || 0);
    evt.timestamp = new Date().toISOString();
    eventQueue.push(evt);

    if (eventQueue.length >= CFG.batchMaxSize) {
      flushQueue();
    }
  }

  function flushQueue() {
    if (eventQueue.length === 0) return;
    var batch = eventQueue.splice(0, eventQueue.length);
    if (CFG.debug) console.log('[Tracker] Flushing ' + batch.length + ' events');

    fetch(supabaseURL('events'), {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify(batch)
    }).catch(function(e) {
      if (CFG.debug) console.error('[Tracker] Flush error:', e);
      // 失败时放回队列头部（最多重试一次，避免无限堆积）
      if (eventQueue.length < 50) {
        eventQueue = batch.concat(eventQueue);
      }
    });
  }

  // ============================================================
  // 点击追踪（层级命名：模块 → 卡片 → 内容）
  // ============================================================
  function isTrackable(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';

    // 排除关闭按钮、编辑按钮等噪音
    if (el.classList && (
      el.classList.contains('modal-x') ||
      el.classList.contains('img-rm') ||
      el.classList.contains('img-edit-toggle') ||
      el.classList.contains('doc-edit-toggle') ||
      el.classList.contains('lb-prev') ||
      el.classList.contains('lb-next')
    )) return false;

    if (tag === 'button' || tag === 'a') return true;
    if (el.hasAttribute && el.hasAttribute('onclick')) return true;
    if (el.hasAttribute && (
      el.hasAttribute('data-product') ||
      el.hasAttribute('data-project') ||
      el.hasAttribute('data-cat') ||
      el.hasAttribute('data-filter')
    )) return true;
    if (el.classList && (
      el.classList.contains('card') ||
      el.classList.contains('doc-card') ||
      el.classList.contains('doc-visual-card') ||
      el.classList.contains('doc-sheet') ||
      el.classList.contains('img-item') ||
      el.classList.contains('back-top-btn') ||
      el.classList.contains('ntab') ||
      el.classList.contains('fbtn')
    )) return true;
    if (tag === 'li' && el.closest && el.closest('.doc-card, .doc-visual-card, .dv-body')) return true;
    if (tag === 'img' && el.closest && el.closest('.img-scroll, .doc-cover')) return true;
    // 导航栏联系方式
    if (el.closest && el.closest('#navContact')) return true;
    return false;
  }

  function findTrackableAncestor(el, depth) {
    depth = depth || 0;
    if (depth > 6) return null;
    if (!el || el === document.body || el === document.documentElement) return null;
    if (isTrackable(el)) return el;
    return findTrackableAncestor(el.parentElement, depth + 1);
  }

  // 层级命名：模块 → 卡片 → 内容
  function buildElementName(el) {
    if (!el) return null;

    // 弹窗内容：复用打开弹窗时的上下文路径
    if (el.closest && el.closest('#modal')) {
      var srcPath = (window._modalSourcePath || '').replace(/ → 产品展示（\d+\/\d+）$/, '');
      if (!srcPath) {
        var mtEl = document.getElementById('modal-title');
        srcPath = mtEl ? mtEl.textContent.replace(/\s+/g,' ').trim() : '弹窗';
      }
      // 弹窗中的图片
      if (el.tagName === 'IMG' || el.closest('picture')) {
        var showLabel = '产品展示';
        if (srcPath.indexOf('方案设计') === 0) showLabel = '方案展示';
        else if (srcPath.indexOf('文档撰写') === 0) showLabel = '文件展示';
        var modalImgs = document.querySelectorAll('#modal img');
        var totalImgs = modalImgs.length;
        var curImg = 0;
        modalImgs.forEach(function(im, i) { if (im === el || im.contains(el)) curImg = i + 1; });
        if (totalImgs > 0 && curImg > 0) {
          return srcPath + ' → ' + showLabel + '（' + curImg + '/' + totalImgs + '）';
        }
        return srcPath + ' → ' + showLabel;
      }
      // 关闭按钮等
      if (el.classList && el.classList.contains('modal-x')) return srcPath + ' → 关闭弹窗';
      var t = (el.textContent || '').replace(/\s+/g,' ').trim().substring(0,30);
      return srcPath + (t ? ' → ' + t : '');
    }

    // 导航栏联系方式
    if (el.closest && el.closest('#navContact')) {
      var ct = (el.textContent || '').replace(/\s+/g,' ').trim();
      if (/@/.test(ct) || /邮箱|email/i.test(ct)) return '联系方式 → 邮箱';
      if (/\d{11}/.test(ct) || /手机|电话|phone/i.test(ct)) return '联系方式 → 手机号码';
      return '联系方式 → ' + (ct.substring(0, 20) || '点击');
    }

    // 导航 tab / 筛选按钮
    if (el.hasAttribute && el.hasAttribute('data-filter')) {
      var fl = { design:'代表产品', solution:'方案设计', doc:'文档撰写', mgmt:'项目管理' };
      return '导航栏 → ' + (fl[el.getAttribute('data-filter')] || el.getAttribute('data-filter'));
    }

    // 产品列表项 li[data-product]
    if (el.hasAttribute && el.hasAttribute('data-product')) {
      var card = el.closest('.doc-card');
      var cardName = '';
      if (card) {
        var h4 = card.querySelector('h4');
        if (h4) cardName = h4.textContent.trim();
      }
      var secName = sectionLabel(getSection(el));
      var prodText = (el.textContent || '').replace(/\s+/g,' ').trim().substring(0,40);
      // 图片点击
      var isImg = (el.tagName === 'IMG' || el.closest('picture'));
      if (isImg) {
        var li = el.closest('li[data-product]');
        if (li && card) {
          var siblings = card.querySelectorAll('li[data-product]');
          var total = siblings.length;
          var cur = 0;
          siblings.forEach(function(s, i) { if (s === li) cur = i + 1; });
          if (total > 0 && cur > 0) return secName + ' → ' + cardName + ' → ' + prodText + ' → 产品展示（' + cur + '/' + total + '）';
        }
        return secName + ' → ' + (cardName ? cardName + ' → ' : '') + prodText + ' → 产品展示';
      }
      return secName + ' → ' + (cardName ? cardName + ' → ' : '') + prodText;
    }

    // 方案/管理卡片 .card[data-project]
    if (el.hasAttribute && el.hasAttribute('data-project')) {
      var secName2 = sectionLabel(getSection(el));
      var h3 = el.querySelector('h3');
      var projName = h3 ? h3.textContent.trim().substring(0,50) : el.getAttribute('data-project');
      if (secName2 === '项目管理') return '项目管理 → ' + projName;
      return '方案设计 → ' + projName;
    }

    // 文档卡片
    if (el.classList && (el.classList.contains('doc-visual-card') || el.closest('.doc-visual-card'))) {
      var dvCard = el.closest('.doc-visual-card') || el;
      var dvH4 = dvCard.querySelector('h4');
      var dvName = dvH4 ? dvH4.textContent.trim() : '文档';
      // 图片点击
      if (el.tagName === 'IMG' || el.closest('picture')) {
        var dvImgs = dvCard.querySelectorAll('img');
        var dvTotal = dvImgs.length;
        var dvCur = 0;
        dvImgs.forEach(function(im, i) { if (im === el || im.contains(el)) dvCur = i + 1; });
        if (dvTotal > 0 && dvCur > 0) {
          return '文档撰写 → ' + dvName + '（' + dvCur + '/' + dvTotal + '）';
        }
      }
      return '文档撰写 → ' + dvName;
    }

    // 产品分类卡片 .doc-card
    if (el.classList && (el.classList.contains('doc-card') || el.closest('.doc-card'))) {
      var dcCard = el.closest('.doc-card') || el;
      var dcH4 = dcCard.querySelector('h4');
      var dcName = dcH4 ? dcH4.textContent.trim() : '产品分类';
      return sectionLabel(getSection(el)) + ' → ' + dcName;
    }

    // 返回顶部等
    if (el.classList && el.classList.contains('back-top-btn')) return 'Footer → 返回顶部';

    // fallback
    var text = (el.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 60);
    return sectionLabel(getSection(el)) + ' → ' + (text || el.tagName.toLowerCase());
  }

  function getElementText(el) {
    return buildElementName(el) || ((el.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 60));
  }

  function getSection(el) {
    if (!el || !el.closest) return 'unknown';
    if (el.closest('#modal')) return 'modal';
    if (el.closest('.nav')) return 'nav';
    if (el.closest('#filterBar')) return 'nav';
    var sec = el.closest('[id]');
    if (sec) {
      var sectionIds = { hero: 1, design: 1, solution: 1, doc: 1, mgmt: 1, about: 1 };
      if (sectionIds[sec.id]) return sec.id;
    }
    return 'other';
  }

  function sectionLabel(s) {
    var map = { hero: 'Hero', design: '代表产品', solution: '方案设计', doc: '文档撰写', mgmt: '项目管理', about: 'Footer', nav: '导航栏', modal: '弹窗' };
    return map[s] || s;
  }

  function getModuleName(el, section) {
    if (!el || !el.hasAttribute) return null;
    if (el.hasAttribute('data-product')) return el.getAttribute('data-product');
    if (el.hasAttribute('data-project')) return el.getAttribute('data-project');
    if (el.hasAttribute('data-filter')) return el.getAttribute('data-filter');
    var card = el.closest ? (el.closest('.doc-card') || el.closest('.doc-visual-card')) : null;
    if (card) {
      var h4 = card.querySelector('h4');
      return h4 ? h4.textContent.trim().substring(0, 50) : null;
    }
    var solCard = el.closest ? el.closest('.card[data-cat]') : null;
    if (solCard) {
      var h3 = solCard.querySelector('h3');
      return h3 ? h3.textContent.trim().substring(0, 50) : null;
    }
    return null;
  }

  function handleClick(e) {
    var target = e.target;
    var tracked = findTrackableAncestor(target);
    if (!tracked) return;

    var section = getSection(tracked);
    var module = getModuleName(tracked, section);

    var eventData = {
      event_type: 'click',
      element_id: tracked.id || null,
      element_class: typeof tracked.className === 'string'
        ? tracked.className.split(' ').slice(0, 3).join(' ')
        : null,
      element_text: getElementText(tracked),
      element_tag: tracked.tagName ? tracked.tagName.toLowerCase() : null,
      section: section,
      module: module,
      // 记录路径上下文，供弹窗点击使用
      page_x: Math.round(e.pageX),
      page_y: Math.round(e.pageY)
    };

    // 记录路径，弹窗内点击复用此上下文
    window._modalSourcePath = eventData.element_text;

    // 用 requestIdleCallback 延迟非关键处理
    if (window.requestIdleCallback) {
      requestIdleCallback(function() { enqueueEvent(eventData); }, { timeout: 2000 });
    } else {
      setTimeout(function() { enqueueEvent(eventData); }, 0);
    }
  }

  // ============================================================
  // 模块 / Section 停留时间追踪
  // ============================================================
  function setupSectionObserver() {
    var sectionIds = ['design', 'solution', 'doc', 'mgmt', 'about'];
    var options = { threshold: [0, 0.5] };

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        var sid = entry.target.id;
        if (entry.intersectionRatio >= 0.5) {
          // 进入新 section
          if (currentSection !== sid) {
            // 离开旧 section
            if (currentSection && sectionTimers[currentSection]) {
              var dwellMs = Date.now() - sectionTimers[currentSection];
              enqueueEvent({
                event_type: 'section_leave',
                section: currentSection,
                element_id: currentSection,
                metadata: { dwell_ms: dwellMs }
              });
            }
            // 进入新 section
            currentSection = sid;
            sectionTimers[sid] = Date.now();
            enqueueEvent({
              event_type: 'section_enter',
              section: sid,
              element_id: sid
            });
          }
        }
      });
    }, options);

    sectionIds.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  // ============================================================
  // 滚动深度追踪
  // ============================================================
  function setupScrollDepthTracking() {
    var depths = { 25: false, 50: false, 75: false, 100: false };
    var ticking = false;

    window.addEventListener('scroll', function() {
      if (!ticking) {
        requestAnimationFrame(function() {
          var docH = document.documentElement.scrollHeight;
          var winH = window.innerHeight;
          var scrollY = window.scrollY || window.pageYOffset;
          if (docH <= winH) { ticking = false; return; } // 页面太短
          var pct = Math.round((scrollY + winH) / docH * 100);

          Object.keys(depths).forEach(function(d) {
            if (pct >= parseInt(d) && !depths[d]) {
              depths[d] = true;
              enqueueEvent({
                event_type: 'scroll_depth',
                section: currentSection || 'unknown',
                metadata: { depth_percent: parseInt(d) }
              });
            }
          });
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ============================================================
  // 可见性变化（切标签页）
  // ============================================================
  function setupVisibilityHandler() {
    document.addEventListener('visibilitychange', function() {
      if (document.hidden && currentSection) {
        // 切走：记录离开
        if (sectionTimers[currentSection]) {
          var dwellMs = Date.now() - sectionTimers[currentSection];
          enqueueEvent({
            event_type: 'section_leave',
            section: currentSection,
            element_id: currentSection,
            metadata: { dwell_ms: dwellMs, reason: 'tab_hidden' }
          });
        }
      } else if (!document.hidden && currentSection) {
        // 切回：重新计时
        sectionTimers[currentSection] = Date.now();
        enqueueEvent({
          event_type: 'section_enter',
          section: currentSection,
          element_id: currentSection,
          metadata: { reason: 'tab_visible' }
        });
      }
    });
  }

  // ============================================================
  // 初始化
  // ============================================================
  function init() {
    visitorId = getOrCreateVisitorId();
    sessionId = createSessionId();
    deviceInfo = captureDeviceInfo();

    // 上报 session 和 pageview
    sendSessionStart();
    sendPageview();

    // 启动事件监听
    document.addEventListener('click', handleClick, true);
    setupSectionObserver();
    setupScrollDepthTracking();
    setupVisibilityHandler();

    // 定时刷新事件队列
    flushTimer = setInterval(flushQueue, CFG.batchInterval);

    // 心跳更新在线时长
    heartbeatTimer = setInterval(sendHeartbeat, CFG.heartbeatInterval);

    // 页面关闭时结束 session
    window.addEventListener('beforeunload', function() {
      clearInterval(flushTimer);
      clearInterval(heartbeatTimer);
      flushQueue();
      sendSessionEnd();
    });

    if (CFG.debug) {
      console.log('[Tracker] Initialized — session:', sessionId, 'visitor:', visitorId, deviceInfo);
    }
  }

  // ============================================================
  // 启动
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
