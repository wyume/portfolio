/* ============================================================
   Portfolio — Filter + Modal + Reveal
   ============================================================ */
(function () {
  'use strict';

  /* ==============================
     Cloud Data Helpers
     本地 localStorage 缓存 + Supabase 云端同步
     ============================== */
  /** 统一保存：先写 localStorage，再异步写 Supabase */
  function _saveCustomData(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch(e) {}
    if (window.DS && window.DS.isOnline()) {
      window.DS.saveContent(key, data).catch(function(){});
    }
  }

  /** 页面加载时双向同步：上传本地 → 下载云端 → 合并刷新 */
  function _initCloudContent() {
    if (!window.DS || !window.DS.isOnline()) return;

    var CONTENT_KEYS = [
      '_custom_sec_titles', '_custom_prod_descs', '_custom_prod_metrics',
      '_custom_sln_data', '_custom_sln_titles', '_custom_sln_chips',
      '_custom_sln_card_descs', '_custom_mgmt_titles', '_custom_mgmt_descs',
      '_custom_mgmt_steps', '_custom_doc_titles', '_custom_doc_items',
      '_custom_doc_descs', '_custom_design_cats', '_custom_design_items',
      '_design_desc', '_cloud_file_urls', '_custom_hero_title', '_custom_hero_desc'
    ];

    // 第一步：从云端下载并合并到本地
    var downloads = [];
    var hasUpdate = false;
    CONTENT_KEYS.forEach(function(k) {
      downloads.push(
        window.DS.loadContent(k).then(function(cloudVal) {
          if (cloudVal != null) {
            var localRaw = localStorage.getItem(k);
            var localVal = null;
            try { if (localRaw) localVal = JSON.parse(localRaw); } catch(e) { localVal = localRaw; }
            if (JSON.stringify(cloudVal) !== JSON.stringify(localVal)) {
              try { localStorage.setItem(k, JSON.stringify(cloudVal)); } catch(e) {}
              hasUpdate = true;
            }
          }
        }).catch(function(){})
      );
    });

    // 第二步：上传本地数据到云端（直接用 fetch，绕过 DS）
    Promise.all(downloads).then(function() {
      // 双向协调 _cloud_file_urls：云端→本地添加，本地→云端清理
      var cloudUrlsRaw = localStorage.getItem('_cloud_file_urls');
      if (cloudUrlsRaw) {
        try {
          var cloudMap = JSON.parse(cloudUrlsRaw);
          if (cloudMap && typeof cloudMap === 'object' && !Array.isArray(cloudMap)) {
            Object.keys(cloudMap).forEach(function(localKey) {
              var urls = cloudMap[localKey] || [];
              var existing = [];
              try {
                var raw = localStorage.getItem(localKey);
                if (raw) {
                  var parsed = JSON.parse(raw);
                  if (Array.isArray(parsed) && !(parsed.length === 1 && parsed[0] === '__IDB__')) {
                    existing = parsed;
                  }
                }
              } catch(e) {}
              // 1) 云端有但本地无 → 添加到本地（来自其他浏览器的新文件）
              var added = false;
              var merged = existing.slice();
              urls.forEach(function(u) { if (merged.indexOf(u) === -1) { merged.push(u); added = true; } });
              // 2) 本地有但云端无 → 从本地移除（在其他浏览器被删除了）
              var removed = false;
              if (urls.length === 0 && existing.length > 0) {
                // 云端清空了 → 本地（localStorage + sessionStorage + IndexedDB）也清空
                merged = [];
                removed = true;
                try { sessionStorage.removeItem(localKey); } catch(e) {}
                _prodDBSave(localKey, []);
              } else if (urls.length > 0 && existing.length > 0) {
                // 过滤掉本地不在云端列表中的 Supabase URL
                var filtered = existing.filter(function(item) {
                  // 保留非 URL 项目（base64 等本地数据）
                  if (typeof item !== 'string' || item.indexOf('supabase.co/storage') === -1) return true;
                  // Supabase URL 必须在云端列表里才保留
                  return urls.indexOf(item) !== -1;
                });
                if (filtered.length < existing.length) {
                  merged = filtered;
                  removed = true;
                  // 重新合并云端新增的
                  urls.forEach(function(u) { if (merged.indexOf(u) === -1) merged.push(u); });
                }
              }
              if (added || removed) {
                if (merged.length > 0) {
                  try { localStorage.setItem(localKey, JSON.stringify(merged)); } catch(e) {}
                } else {
                  try { localStorage.removeItem(localKey); } catch(e) {}
                }
                hasUpdate = true;
              }
            });
          }
        } catch(e) {}
      }

      var SUPABASE_URL = 'https://gvnzxuldnbdrsvclvuul.supabase.co';
      var SUPABASE_KEY = 'sb_publishable_dTms1JmEP3yG9MoNI32y-Q_GI9bUjAg';
      var uploads = [];
      CONTENT_KEYS.forEach(function(k) {
        if (k === '_cloud_file_urls') return; // 由上传/删除的专用函数管理，不在这里覆盖
        var raw = localStorage.getItem(k);
        if (!raw) return;
        var val;
        try { val = JSON.parse(raw); } catch(e) { val = raw; }
        uploads.push(
          fetch(SUPABASE_URL + '/rest/v1/portfolio_content?key=eq.' + encodeURIComponent(k), {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': 'Bearer ' + SUPABASE_KEY,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ key: k, value: val, updated_at: new Date().toISOString() })
          }).then(function(r) {
            if (!r.ok) {
              // PATCH 失败（行不存在），回退到 POST
              return fetch(SUPABASE_URL + '/rest/v1/portfolio_content', {
                method: 'POST',
                headers: {
                  'apikey': SUPABASE_KEY,
                  'Authorization': 'Bearer ' + SUPABASE_KEY,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({ key: k, value: val, updated_at: new Date().toISOString() })
              });
            }
          }).catch(function(){})
        );
      });
      return Promise.all(uploads).then(function() {
        if (hasUpdate) setTimeout(function() { location.reload(); }, 300);
      });
    });
  }

  /** 文件上传后同步到 Supabase Storage */
  function _uploadToCloud(base64data, category, key, filename) {
    if (!window.DS || !window.DS.isOnline()) { console.log('[Cloud] 离线或无DS，跳过上传'); return; }
    window.DS.uploadCompressedImage(base64data, category, key, filename || 'image.jpg').then(function(url) {
      console.log('[Cloud] 上传成功:', url);
      _saveCloudFileUrl(key, url);
    }).catch(function(err) {
      console.error('[Cloud] 上传失败:', err);
    });
  }

  /** 原始文件上传到 Supabase Storage（PDF/Word/PPT） */
  function _uploadFileToCloud(file, category, key) {
    if (!window.DS || !window.DS.isOnline()) return;
    window.DS.uploadFile(file, category, key).catch(function(){});
  }

  /** 将云端文件 URL 持久化到 localStorage + portfolio_content 表，新浏览器打开时可加载 */
  function _saveCloudFileUrl(key, url) {
    var SUPABASE_URL = 'https://gvnzxuldnbdrsvclvuul.supabase.co';
    var SUPABASE_KEY = 'sb_publishable_dTms1JmEP3yG9MoNI32y-Q_GI9bUjAg';
    // 1. 更新 localStorage
    var existing = [];
    try {
      var raw = localStorage.getItem(key);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && !(parsed.length === 1 && parsed[0] === '__IDB__')) { existing = parsed; }
      }
    } catch(e) {}
    if (existing.indexOf(url) === -1) {
      existing.push(url);
      try { localStorage.setItem(key, JSON.stringify(existing)); } catch(e) {}
    }
    // 2. 同步到 Supabase content 表（统一 key: _cloud_file_urls，值为 { localStorageKey: [urls] }）
    var contentKey = '_cloud_file_urls';
    fetch(SUPABASE_URL + '/rest/v1/portfolio_content?key=eq.' + encodeURIComponent(contentKey), {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    }).then(function(r) { return r.json(); }).then(function(rows) {
      var map = (rows && rows.length && rows[0].value) ? rows[0].value : {};
      if (typeof map !== 'object' || Array.isArray(map)) map = {};
      if (!map[key]) map[key] = [];
      if (map[key].indexOf(url) === -1) {
        map[key].push(url);
        var payload = { key: contentKey, value: map, updated_at: new Date().toISOString() };
        return fetch(SUPABASE_URL + '/rest/v1/portfolio_content?key=eq.' + encodeURIComponent(contentKey), {
          method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(payload)
        }).then(function(r2) {
          if (!r2.ok) {
            return fetch(SUPABASE_URL + '/rest/v1/portfolio_content', {
              method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
              body: JSON.stringify(payload)
            });
          }
        });
      }
    }).catch(function(){});
  }

  /** 删除操作后同步云端状态：从 _cloud_file_urls 中移除已不存在的 URL */
  function _syncCloudUrlsAfterDelete(key) {
    var SUPABASE_URL = 'https://gvnzxuldnbdrsvclvuul.supabase.co';
    var SUPABASE_KEY = 'sb_publishable_dTms1JmEP3yG9MoNI32y-Q_GI9bUjAg';
    // 收集当前本地还存在的 Supabase URLs
    var localUrls = new Set();
    function collect(store) {
      try {
        var raw = store.getItem(key);
        if (!raw) return;
        var arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return;
        arr.forEach(function(item) {
          if (typeof item === 'string' && item.indexOf('supabase.co/storage') > -1) {
            localUrls.add(item);
          }
        });
      } catch(e) {}
    }
    collect(localStorage);
    collect(sessionStorage);
    // 异步查 IndexedDB
    _prodDBLoad(key, function(dbItems) {
      (dbItems || []).forEach(function(item) {
        if (typeof item === 'string' && item.indexOf('supabase.co/storage') > -1) {
          localUrls.add(item);
        }
      });
      // 更新 _cloud_file_urls
      var contentKey = '_cloud_file_urls';
      var raw = localStorage.getItem(contentKey);
      var map = {};
      try { if (raw) map = JSON.parse(raw); } catch(e) {}
      if (typeof map !== 'object' || Array.isArray(map)) map = {};
      if (localUrls.size > 0) {
        map[key] = Array.from(localUrls);
      } else {
        map[key] = [];
      }
      try { localStorage.setItem(contentKey, JSON.stringify(map)); } catch(e) {}
      // Push to Supabase
      var payload = { key: contentKey, value: map, updated_at: new Date().toISOString() };
      fetch(SUPABASE_URL + '/rest/v1/portfolio_content?key=eq.' + encodeURIComponent(contentKey), {
        method: 'PATCH', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(payload)
      }).then(function(r2) {
        if (!r2.ok) {
          return fetch(SUPABASE_URL + '/rest/v1/portfolio_content', {
            method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify(payload)
          });
        }
      }).catch(function(){});
    });
  }

  /* ==============================
     Project Detail Data
     (replace with your real content)
     ============================== */
  var data = {
    design: {
      tag: '产品设计', tagBg: 'rgba(0,85,255,.08)', tagColor: '#0055FF',
      title: '国家反诈中心 App · 全民反诈 App',
      sections: [
        { h: '项目背景', b: '公安部五局牵头建设并面向全国推广的政务反诈官方平台，旨在构建"预警劝阻、风险核验、线索举报、联动处置、宣传教育"一体化反诈防护体系，同步解决地方反诈数据应用与能力拓展问题。' },
        { h: '我的角色', b: '围绕反诈"事前-事中-事后"全流程，统筹各端产品规划与业务架构设计。负责App与反诈平台功能设计、规则制定，确保贴合公安实战要求。兼任省级分布式项目经理，主导地方公安业务调研、方案、售前、招投标等事项。' },
        { h: '关键产出', b: '构建多项实战产品功能并上线落地，在全国多省市反诈业务中实际应用。为多地省市公安输出本地化反诈服务方案，解决各省市差异化反诈需求。' },
        { h: '量化成果', b: '电诈案件采集时长由1小时+缩短至20分钟，显著提升办案效率。有效提升预警劝阻触达率与群众防骗意识，助力多地降低电诈案件发案率。顺利完成多个省级分布式项目的招投标及交付，形成可复制的项目交付标准。' }
      ]
    },
    arch: {
      tag: '方案设计', tagBg: 'rgba(0,163,224,.08)', tagColor: '#00A3E0',
      title: '省级国反分布式', logo: 'images/gjfz-logo.png', logoBg: false,
      desc: '基于国家反诈中心App，为各省市构建标准化反诈方案，赋能地方公安数据应用与能力拓展。',
      sections: [
        { h: '方案架构', b: '基于国家反诈中心App，构建省-市-县三级联动的分布式反诈服务平台。定义数据通道、消息队列、同步机制与安全传输规范，实现跨层级数据共享与协同处置。' },
        { h: '核心能力', b: '涵盖预警劝阻、风险核验、线索举报、联动处置、宣传教育五大模块的本地化适配方案。制定BCP数据包规范与RESTful API接口标准，保障系统间的高效互通。' },
        { h: '交付标准', b: '形成可复制的省级项目交付标准，包括技术方案模板、招投标文件模板、实施计划框架，已在多个省市成功落地。' }
      ],
      imgs: ['images/sjgf-01.png', 'images/sjgf-02.png', 'images/sjgf-03.png', 'images/sjgf-04.png']
    },
    doc: {
      tag: '文档撰写', tagBg: 'rgba(0,184,83,.08)', tagColor: '#00B853',
      title: '项目文档与标准规范',
      sections: [
        { h: '项目背景', b: '大型政务与金融项目涉及多方协作，文档标准化是保障交付质量与沟通效率的基石。从业10年间在各项目中持续输出高质量文档。' },
        { h: '我的角色', b: '在公安部五局项目中参与《项目建议书》《可研报告》编制。在省级项目中主导招投标文件、技术方案、接口规范文档编写。在金融项目中撰写PRD、合规方案、数据分析报告。' },
        { h: '关键产出', b: '《十四五国家政务信息化工程项目建议书》《可研报告》（参与编制）、《省级反诈分布式系统技术方案》《对外接口标准文档》《现勘对接文档》《PRD模板》《数据分析报告》等。' },
        { h: '量化成果', b: '文档标准化后，省级项目招投标及交付效率显著提升，技术对接沟通成本大幅降低，交付文档一次通过率持续保持在95%以上。' }
      ]
    },
    mgmt: {
      title: '多类型项目交付实践',
      steps: [
        { title: '构建交付模型', sub: '招标投标 · 企业自营 · 合作共建', detail: '建立三类项目交付模型，匹配差异化资源策略与风险控制方案，确保跨模式交付质量与客户满意度的一致性。', grad: 'linear-gradient(180deg, #6366F1, #06B6D4, #10B981)' },
        { title: '沉淀标准体系', sub: '标准作业 · 场景适配 · 里程把控', detail: '沉淀五阶段标准化交付体系与可复用作业模板，在流程规范与场景适配之间建立动态平衡，支撑多项目并行推进而不失质量把控。', grad: 'linear-gradient(180deg, #6366F1, #06B6D4, #10B981)' },
        { title: '驱动持续改进', sub: '上线验收 · 持续迭代 · 复盘归档', detail: '以验收—复盘—归档为闭环驱动，将单项目经验系统化沉淀为组织级知识资产，使后续项目交付周期持续缩短。', grad: 'linear-gradient(180deg, #6366F1, #06B6D4, #10B981)' }
      ]
    },
    team: {
      title: '建立自运转产品团队',
      steps: [
        { title: '搭建产品团队', sub: '按线配置 · 定岗定责 · 规范协作', detail: '按业务线配置产品与设计人员并明确职责边界，以周例会、评审、走查等常态化机制形成稳定产出节奏，保障各业务线高效运转。', grad: 'linear-gradient(180deg, #6366F1, #06B6D4, #10B981)' },
        { title: '推动责任下沉', sub: '任务分层 · 边界前置 · 结果兜底', detail: '将目标拆解为独立交付单元并授权端到端 ownership，以清晰边界配合定期 check-in，推动成员从被动执行者向独立承担者转变。', grad: 'linear-gradient(180deg, #6366F1, #06B6D4, #10B981)' },
        { title: '统筹多方协同', sub: '公安对接 · 科信协同 · 厂商联动', detail: '统筹公安、网信、运营商、技术厂商等外部 stakeholder，建立常态化信息同步与利益协调机制，保障跨组织项目顺畅推进。', grad: 'linear-gradient(180deg, #6366F1, #06B6D4, #10B981)' }
      ]
    },
    summary: {
      tag: '方案设计', tagBg: 'rgba(0,163,224,.08)', tagColor: '#00A3E0',
      title: '中数链 + 国版数创', logo: 'images/zsliam-logo.png',
      desc: '国家级版权交易保护联盟链超级节点，联合中国网、上海文交所，构建"版权确权-存证-发行-交易"全链路。',
      sections: [
        { h: '业务模式', b: '制定"版权/IP方-发行方-中数链-国版链"四方业务交互模式，覆盖从版权登记确权到数字资产发行流转的全链路业务流程。定义超级节点、可信节点、服务商等多角色协作规则。' },
        { h: '核心能力', b: '适配空投、0元购、二次交易、盲盒、合成等各类数字藏品玩法。完成国版数创交易端及中数链浏览器产品设计，提供数字资产链上溯源与核验服务。' },
        { h: '落地成果', b: '已接入元潮互娱、上元文创、任意门科技等多家文创平台，形成合规闭环的版权交易业务体系与商业化服务能力。' }
      ],
      imgs: ['images/zsliam-01.png', 'images/zsliam-02.png']
    },
    xinsheng: {
      tag: '方案设计', tagBg: 'rgba(0,163,224,.08)', tagColor: '#00A3E0',
      title: '信生代 + 钱包小贷', logo: 'images/xinshengdai-logo.jpg',
      desc: '采用双App模式重构信用卡代偿业务，通过业务隔离实现持牌放贷与代偿场景的风险隔离。',
      sections: [
        { h: '方案架构', b: '在行业监管趋严背景下，采用双App模式重构信用卡代偿业务。通过业务隔离与流程拆分，实现持牌放贷（钱包小贷）与代偿场景（信生代）的业务关联及风险切割。' },
        { h: '风控设计', b: '引入百行征信、人行征信等核心数据源，基于客户信用资质、借贷历史、逾期多头、司法风险等标签，构建用户分层与准入审核体系，为额度授信与风控策略提供数据支撑。' },
        { h: '合规要点', b: '优化小贷、代偿及消费业务流程，明确功能边界与交互逻辑，保障双App在监管框架下的合规运营。' }
      ],
      imgs: ['images/xinshengdai-01.png', 'images/qianbaoxiaodai-01.png']
    }
  };

  /* ==============================
     Product Detail Data (click items in design cards)
     ============================== */
  var productData = {
    // 反电信网络诈骗类
    gjfz: {
      name: '国家反诈中心 App', cat: '反电信网络诈骗类', logo:'images/gjfz-logo.png',
      desc: '为构建一体化全域反诈防护体系，公安部五局牵头建设并面向全国推广的政务反诈官方平台。依托预警劝阻、风险核验、线索举报、联动处置、宣传教育等核心能力，全面强化全民反诈意识与防护水平。',
      metrics: ['覆盖用户 3 亿+', '案件采集 ≤20 分钟', '全国多省市落地', '日均预警拦截 50 万+', 'App Store 工具榜 Top 10', '部局年度优秀项目'],
      imgs: ['images/gjfz-01.png', 'images/gjfz-02.png', 'images/gjfz-03.png', 'images/gjfz-04.png', 'images/gjfz-05.png']
    },
    qmfz: {
      name: '全民反诈 App', cat: '反电信网络诈骗类', logo: 'images/全民反诈logo.png', logoBg: false,
      metrics: ['北京地区专属', '7 大核心功能', '预警触达率 90%+', '北京常住人口覆盖 60%+', '拦截诈骗资金超千万', '市局领导批示推广'], desc: '为夯实首都反诈防线，建设平安首都的治理格局，与北京市公安局联合打造，面向北京地区群众的专属反诈防护工具，以诈骗预警、一键上报、到所报案、身份验真、号码标注、群组反诈等多项实用功能，全方位提升全民防诈、识诈、反诈能力。',
      imgs: ['images/qmfz-01.png', 'images/qmfz-02.png']
    },
    sjgf: {
      name: '省级国反分布式系统', cat: '反电信网络诈骗类', logo: 'images/gjfz-logo.png',
      metrics: ['5+ 省交付', '标准化方案模板', '部地数据协同', '项目复用率 80%+', '覆盖人口超 2 亿', '省厅验收通过率 100%'], desc: '以"国家反诈中心App"为基座，为各省市公安机关构建并落地标准化、定制化的本地化反诈方案与反诈服务平台，赋能地方公安对反诈数据、能力的充分应用与拓展延伸。',
      imgs: ['images/sjgf-01.png', 'images/sjgf-02.png', 'images/sjgf-03.png', 'images/sjgf-04.png']
    },
    jingyin: {
      name: '警音小程序', cat: '反电信网络诈骗类', logo: 'images/警音.png', logoSize: 28,
      metrics: ['公安内部通讯', '实时语音告警', '多端同步', '警情响应 < 3 秒', '覆盖基层所队 100+', '日均调度 5000+ 次'], desc: '公安内部语音预警与通讯产品，提供实时语音告警、警情播报、调度通讯等功能。',
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0VFRjJGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzRGNDZFNScgb3BhY2l0eT0nLjcnPuitpumfs+Wwj+eoi+W6j+WOn+WeizwvdGV4dD48L3N2Zz4=']
    },
    // 区块链数字资产交易类
    zsliam: {
      name: '中数链数字版权交易系统', cat: '区块链数字资产交易类', logo:'images/zsliam-logo.png',
      metrics: ['国家级版权联盟链', '接入 3+ 文创平台', '全链路闭环', '版权登记量 10 万+', '新华社/中国网战略合作', '获国家版权局认可'], desc: '作为国家级版权交易保护联盟链超级节点，联合中国网、上海文交所等机构，面向版权方、发行方及文创平台提供版权登记、权属存证与交易流转一站式链上服务。搭建"版权/IP方—发行方—中数链—国版链"四方业务交互模式，覆盖从登记确权到发行流转的全链路闭环，兼容空投、0元购、二级交易、盲盒、合成等数藏玩法。',
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0U1RjZGQicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzAwQTNFMCcgb3BhY2l0eT0nLjcnPuS4reaVsOmTvuS6pOaYk+W5s+WPsDwvdGV4dD48L3N2Zz4=', 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0UwRjdGQScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzAwOUZENCcgb3BhY2l0eT0nLjcnPueJiOadg+S6pOaYk+a1geeoizwvdGV4dD48L3N2Zz4=']
    },
    guoban: {
      name: '国版数创', cat: '区块链数字资产交易类', logo: 'images/国版数创logo.png',
      metrics: ['数字资产发行', '二级市场', '智能分账', '首发售罄率 100%', '入驻创作者 500+', '版税结算零差错'], desc: '国家级数字版权创新平台交易端，依托国版链实现版权资产的数字化发行与二级市场流转。支持版权方入驻、资产发行上链、用户购买交易与版税自动分账，将版权价值从登记确权延伸至市场化流通。',
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0U1RjZGQicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzAwQTNFMCcgb3BhY2l0eT0nLjcnPuWbveeJiOaVsOWIm+W5s+WPsDwvdGV4dD48L3N2Zz4=']
    },
    'zsl-browser': {
      name: '中数链浏览器', cat: '区块链数字资产交易类', logo: 'images/zsliam-logo.png',
      metrics: ['链上可视化', '合约验证', '实时追踪', '日均查询 10 万+', '支持 3 条主流公链', '查询响应 < 1 秒'], desc: '区块链数据查询与链上核验工具，兼容旗下可信节点与服务商文创平台。将链上存证信息与版权业务打通，提供数字资产溯源、交易记录查询、智能合约验证等能力，为版权确权与交易透明度提供可验证的链上依据。',
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0UwRjdGQScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzAwOUZENCcgb3BhY2l0eT0nLjcnPuS4reaVsOmTvua1j+iniOWZqDwvdGV4dD48L3N2Zz4=']
    },
    bitker: {
      name: 'BITKER 数字资产交易平台', cat: '区块链数字资产交易类', logo: 'images/币客.png', logoSize: 26,
      metrics: ['多币种支持', '全球多语言', '现货+合约交易', '日均交易额 $1 亿+', '100+ 交易对', '系统可用性 99.9%', '覆盖 50+ 国家'], desc: '全球化的数字资产交易平台，支持多币种交易、法币兑换、资产管理等功能。',
      outputs: [
        { label: '交易系统设计', detail: '现货/合约交易界面、K线图表交互、订单簿与深度图设计、多语言国际化方案' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0U1RjZGQicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzAwQTNFMCcgb3BhY2l0eT0nLjcnPkJJVEtFUuS6pOaYk+W5s+WPsDwvdGV4dD48L3N2Zz4=', 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0UwRjdGQScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzAwOUZENCcgb3BhY2l0eT0nLjcnPkvnur/lm77ooajorr7orqE8L3RleHQ+PC9zdmc+']
    },
    // 互联网金融类
    hudaiwang: {
      name: '互贷网理财', cat: '互联网金融类', logo: 'images/互贷网理财logo.png',
      metrics: ['资金存管银行对接', '年均交易额 10 亿+', '用户 50 万+', '累计撮合资金破百亿', '平台合规备案通过', '用户复投率 70%+'], desc: '聚焦普惠金融领域，依托线下真实借贷资产，提供多元化理财及债权转让服务，实现资金撮合、资产匹配与本息回款全流程线上化运营。',
      outputs: [
        { label: '全端产品管理', detail: '全生命周期管理，从需求→研发→质控→上线运营全流程推进' },
        { label: '资金存管对接', detail: '理财端与新网银行资金存管系统对接方案设计，保障平台监管合规' },
        { label: '数据分析体系', detail: '基于核心业务场景构建数据分析体系，助力平台运营与产品优化迭代' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0U4RjhFRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzAwQjg1Mycgb3BhY2l0eT0nLjcnPuS6kui0t+e9keeQhui0ouW5s+WPsDwvdGV4dD48L3N2Zz4=']
    },
    gnxd: {
      name: '天天速贷 App', cat: '互联网金融类', logo: 'images/天天速贷logo.png',
      metrics: ['多机构聚合', '智能产品匹配', '合规流程', '对接金融机构 30+', '授信通过率提升 25%', '月均撮合金额破亿'], desc: '金融信息服务平台，聚合银行/消金/小贷机构资源，提供个人信贷撮合与智能匹配服务。',
      outputs: [
        { label: '合规设计', detail: '结合金融监管要求与用户需求，完成信贷产品全流程梳理，保障合规落地' },
        { label: '多产品迭代', detail: '多款消金产品设计与持续迭代，涵盖授信评估、产品匹配、会员权益等核心模块' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0U4RjhFRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzAwQjg1Mycgb3BhY2l0eT0nLjcnPuWkqeWkqemAn+i0t0FwcDwvdGV4dD48L3N2Zz4=']
    },
    gwxd: {
      name: '金享会 App', cat: '互联网金融类', logo: 'images/金享会logo.png',
      metrics: ['授信风控', '产品矩阵', '会员权益', '风险逾期率 < 2%', '会员转化率 40%+', '接入征信数据源 5+'], desc: '面向个人用户的助贷撮合服务，提供授信评估、产品匹配、会员权益等核心功能。',
      outputs: [
        { label: '产品矩阵', detail: '结合金融监管与用户需求，完成助贷产品全流程设计与合规落地' },
        { label: '风控数据', detail: '引入百行、人行征信等数据源，基于信用资质/借贷历史/逾期多头等标签，为风控策略提供数据支撑' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0U4RjhFRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzAwQjg1Mycgb3BhY2l0eT0nLjcnPui2hee6p+mHkeWNoUFwcDwvdGV4dD48L3N2Zz4=']
    },
    popcash: {
      name: 'PopCashLoan、LendingMax', cat: '互联网金融类',
      metrics: ['海外本地化', '全流程管理', '已上线试运行', '印度市场用户 10 万+', '放款审批 < 5 分钟', '回款率 85%+'], desc: '面向印度及海外市场的小额信贷产品线，涵盖"贷前-贷中-贷后"全流程管理，已上线试运行。',
      outputs: [
        { label: '市场调研', detail: '印度及东南亚信贷市场监管政策与竞品调研，梳理当地用户信用评估习惯与风控要点' },
        { label: '产品设计', detail: '移动端借款与助贷产品设计，覆盖授信、审批、还款等核心模块，适配多语言多币种需求' },
        { label: '交付成果', detail: '完成产品设计交付并上线，支撑业务在海外市场开展试运行' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0U4RjhFRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzAwQjg1Mycgb3BhY2l0eT0nLjcnPlBvcENhc2hMb2FuPC90ZXh0Pjwvc3ZnPg==']
    },
    // 金融支付类
    quanzhanye: {
      name: '全民展业 App', cat: '金融支付类', logo: 'images/quanzhanye-logo.svg',
      metrics: ['银行卡收单', '实时查询', '业绩看板', '入驻商户 5000+', '日均交易 10 万+ 笔', '系统稳定运行 3 年+'], desc: '面向商户的展业工具，支持银行卡收单、商户管理、交易查询、业绩统计等功能。',
      outputs: [
        { label: '商户端设计', detail: '商户入驻/终端绑定/交易查询/结算对账/业绩看板五大模块原型设计' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0YzRUVGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzdDM0FFRCcgb3BhY2l0eT0nLjcnPuWFqOawkeWxleS4mkFwcDwvdGV4dD48L3N2Zz4=']
    },
    weifenxiao: {
      name: '微分销平台', cat: '金融支付类',
      metrics: ['多级分销', '自动结算', '团队管理', '分销商 3000+', '月佣金结算破百万', '裂变转化率 35%+'], desc: '面向商户的分销管理平台，支持多级分销、佣金结算、团队管理等功能。',
      outputs: [
        { label: '分销体系', detail: '多级分销层级设计、佣金比例配置、分润结算流程、团队业绩看板' }
      ],
      imgs: ['images/weifenxiao-01.png']
    },
    xinshengdai: {
      name: '信生代 App', cat: '金融支付类', logo: 'images/xinshengdai-logo.jpg', logoBg: true,
      metrics: ['智能还款', '多卡管理', '实时计费', '服务用户 20 万+', '还款成功率 98%+', '用户月留存 85%+'], desc: '信用卡代还服务平台，提供智能还款计划、费率计算、账单管理等金融工具。',
      outputs: [
        { label: '核心流程', detail: '信用卡绑定→账单导入→智能还款计划生成→执行扣款→结果通知，全流程闭环设计' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0YzRUVGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzdDM0FFRCcgb3BhY2l0eT0nLjcnPuS/oeeUn+S7o0FwcDwvdGV4dD48L3N2Zz4=']
    },
    qianbaoxiaodai: {
      name: '钱包小贷 App', cat: '金融支付类',
      metrics: ['快速授信', '灵活分期', '全程风控', '授信审批 < 3 分钟', '放款总额破五亿', '不良率 < 1.5%'], desc: '小额信贷产品，面向个人用户提供快速借款、分期还款等金融服务。',
      outputs: [
        { label: '借款流程', detail: '实名认证→信用评估→额度审批→借款申请→放款→还款提醒，全流程原型与交互说明' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0YzRUVGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nIzdDM0FFRCcgb3BhY2l0eT0nLjcnPumSseWMheWwj+i0t0FwcDwvdGV4dD48L3N2Zz4=']
    },
    // 社交电商类
    panda: {
      name: '熊猫买手 App', cat: '社交电商类', logo: 'images/熊猫买手logo.png',
      metrics: ['社交裂变', '二级分销', '社群运营', '买手入驻 2000+', '月 GMV 突破千万', '用户裂变率 300%+'], desc: '社交电商买手平台，结合社交裂变与电商交易，提供商品推荐、佣金分润、社群运营等功能。',
      outputs: [
        { label: '社交裂变设计', detail: '邀请返佣机制、二级分销体系、社群红包/拼团/秒杀等裂变玩法设计' },
        { label: '买手端原型', detail: '商品采集→内容编辑→发布推广→佣金结算，买手全流程操作界面设计' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0ZGRjVFNScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nI0ZGNzcwMCcgb3BhY2l0eT0nLjcnPueGiueMq+S5sOaJi0FwcDwvdGV4dD48L3N2Zz4=', 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0ZGRjhFRCcvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nI0Y1N0MwMCcgb3BhY2l0eT0nLjcnPuekvuS6pOijguWPmOa1geeoizwvdGV4dD48L3N2Zz4=']
    },
    octopus: {
      name: '八爪鱼平台', cat: '社交电商类',
      metrics: ['多平台聚合', '智能定价', '一键分发', '对接渠道 20+', '商品 SKU 百万级', '分销效率提升 50%'], desc: '多源商品聚合与分销平台，支持商品采集、智能定价、多渠道分发、订单管理等核心能力。',
      outputs: [
        { label: '平台架构', detail: '多源商品采集引擎→统一商品库→智能定价策略→多渠道一键分发→订单归集管理' },
        { label: '运营后台', detail: '商品管理/渠道管理/价格策略/订单路由/数据报表，运营后台全套原型设计' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0ZGRjVFNScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nI0ZGNzcwMCcgb3BhY2l0eT0nLjcnPuWFq+eIqumxvOW5s+WPsDwvdGV4dD48L3N2Zz4=', 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0ZGRjhFRCcvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nI0Y1N0MwMCcgb3BhY2l0eT0nLjcnPui/kOiQpeWQjuWPsDwvdGV4dD48L3N2Zz4=']
    },
    feiyu: {
      name: '飞鱼合伙人 App', cat: '社交电商类',
      metrics: ['合伙人模式', '分销裂变', '佣金激励', '合伙人 1000+', '月佣金破 500 万', '团队裂变 5 级+'], desc: '社交电商合伙人平台，以合伙人/代理商模式为核心，支持多级分销、团队管理、佣金结算与裂变增长。',
      outputs: [
        { label: '合伙人体系', detail: '合伙人等级/权益/晋升机制设计，团队裂变与下级绑定逻辑，佣金计算与提现流程' },
        { label: '运营管理后台', detail: '合伙人审核/业绩看板/佣金配置/活动管理/数据报表，全套运营后台设计' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0ZGRjVFNScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nI0ZGNzcwMCcgb3BhY2l0eT0nLjcnPumjnumxvOWQieS8mkFwcDwvdGV4dD48L3N2Zz4=', 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0ZGRjhFRCcvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nI0Y1N0MwMCcgb3BhY2l0eT0nLjcnPuWIhuafsuezu+e6pzwvdGV4dD48L3N2Zz4=']
    },
    maishou: {
      name: '买手商户平台', cat: '社交电商类',
      metrics: ['商户入驻', '商品管理', '订单履约', '入驻商户 3000+', '日均订单 5 万+', '商户满意度 95%+'], desc: '面向 B 端商户的 SaaS 管理平台，支持店铺开通、商品上架、订单处理、结算对账等商户日常运营需求。',
      outputs: [
        { label: '商户管理后台', detail: '店铺配置/商品管理/库存管理/订单处理/物流跟踪/对账结算，一站式商户 SaaS 后台' },
        { label: '平台运营端', detail: '商户审核/类目管理/佣金配置/纠纷处理/数据看板，平台运营方全套管理工具' }
      ],
      imgs: ['data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0ZGRjVFNScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nI0ZGNzcwMCcgb3BhY2l0eT0nLjcnPuS5sOaJi+WVhuaIt+W5s+WPsDwvdGV4dD48L3N2Zz4=', 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc2MDAnIGhlaWdodD0nNDAwJz48cmVjdCB3aWR0aD0nNjAwJyBoZWlnaHQ9JzQwMCcgZmlsbD0nI0ZGRjhFRCcvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc1MCcgZm9udC13ZWlnaHQ9JzYwMCcgZmlsbD0nI0Y1N0MwMCcgb3BhY2l0eT0nLjcnPui/kOiQpeS4reWPsDwvdGV4dD48L3N2Zz4=']
    }
  };

  /* ==============================
     Document Card Detail Data
     ============================== */
  var docData = {
    '产品规划': {
      icon: '📋', color: '#00B853',
      title: '产品规划',
      desc: '产品核心需求定义与规划文档，驱动研发落地与质量保障。',
      items: [
        { name: '产品需求文档 (PRD)', detail: '包含功能描述、用户故事、验收标准、优先级定义，是产品开发的基准文档。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0U4RjhFRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMDBCODUzJyBvcGFjaXR5PScuNyc+UFJEIERvY3VtZW50PC90ZXh0Pjwvc3ZnPg==', icon: 'images/doc-type-word.png?v=3' },
        { name: '需求规格说明书 (SRS)', detail: '详细定义系统功能边界、输入输出、约束条件，供开发测试团队使用。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0VDRkRGNScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMDU5NjY5JyBvcGFjaXR5PScuNyc+U1JTIFNwZWM8L3RleHQ+PC9zdmc+', icon: 'images/doc-type-word.png?v=3' },
        { name: '产品路线图', detail: '中长期产品迭代规划，明确各阶段里程碑、功能优先级与资源分配。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0U4RjhFRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMDBCODUzJyBvcGFjaXR5PScuNyc+Um9hZG1hcDwvdGV4dD48L3N2Zz4=', icon: 'images/doc-type-img.png?v=3' },
        { name: '需求跟踪矩阵 (RTM)', detail: '从需求到测试用例的双向追溯，确保每条需求都被实现和验证。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0VDRkRGNScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMDU5NjY5JyBvcGFjaXR5PScuNyc+UlRNIFRyYWNlPC90ZXh0Pjwvc3ZnPg==', icon: 'images/doc-type-excel.png?v=3' }
      ]
    },
    '招标投标': {
      icon: '📑', color: '#0055FF',
      title: '招标投标',
      desc: '政府采购与企业采购全流程文档，支撑项目中标与合同落地。',
      items: [
        { name: '项目标书 / 投标文件', detail: '包含技术方案、实施计划、团队资质、报价明细等完整投标内容。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0VFRjJGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjNEY0NkU1JyBvcGFjaXR5PScuNyc+QmlkIERvY3VtZW50PC90ZXh0Pjwvc3ZnPg==', icon: 'images/doc-type-word.png?v=3' },
        { name: '技术方案（投标用）', detail: '针对招标需求定制的技术架构、实施方案与项目计划。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0U4RjFGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMDA1NUZGJyBvcGFjaXR5PScuNyc+VGVjaCBQcm9wb3NhbDwvdGV4dD48L3N2Zz4=', icon: 'images/doc-type-word.png?v=3' },
        { name: '商务应答 / 偏离表', detail: '针对招标文件逐条响应的技术偏离表和商务应答文件。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0VFRjJGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjNEY0NkU1JyBvcGFjaXR5PScuNyc+UmVzcG9uc2UgRG9jPC90ZXh0Pjwvc3ZnPg==', icon: 'images/doc-type-word.png?v=3' },
        { name: '成本分析 / 报价文件', detail: '基于工作量评估和人天费率的项目成本核算与报价依据。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0U4RjFGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMDA1NUZGJyBvcGFjaXR5PScuNyc+Q29zdCBBbmFseXNpczwvdGV4dD48L3N2Zz4=', icon: 'images/doc-type-word.png?v=3' }
      ]
    },
    '调研分析': {
      icon: '🔍', color: '#00A3E0',
      title: '调研分析',
      desc: '项目前期的市场、用户与竞品调研，为产品方向提供决策依据。',
      items: [
        { name: '市场调研报告', detail: '行业现状、市场规模、竞争格局、发展趋势的系统分析。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0U1RjZGQicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMDBBM0UwJyBvcGFjaXR5PScuNyc+TWFya2V0IFJlc2VhcmNoPC90ZXh0Pjwvc3ZnPg==', icon: 'images/doc-type-ppt.png?v=3' },
        { name: '竞品分析报告', detail: '对标竞品的功能对比、优劣势分析、差异化策略建议。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0UwRjdGQScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMDA5RkQ0JyBvcGFjaXR5PScuNyc+Q29tcGV0aXRpdmUgQW5hbHlzaXM8L3RleHQ+PC9zdmc+', icon: 'images/doc-type-ppt.png?v=3' },
        { name: '用户调研报告', detail: '目标用户的深度访谈记录，包含痛点、场景、期望等一手信息。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0U1RjZGQicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMDBBM0UwJyBvcGFjaXR5PScuNyc+VXNlciBSZXNlYXJjaDwvdGV4dD48L3N2Zz4=', icon: 'images/doc-type-word.png?v=3' },
        { name: '可行性研究报告', detail: '技术可行性、经济可行性、法律合规性的综合分析报告。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0UwRjdGQScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMDA5RkQ0JyBvcGFjaXR5PScuNyc+RmVhc2liaWxpdHkgU3R1ZHk8L3RleHQ+PC9zdmc+', icon: 'images/doc-type-word.png?v=3' }
      ]
    },
    '项目汇报': {
      icon: '📊', color: '#3B82F6',
      title: '项目汇报',
      desc: '面向管理层与客户的汇报材料，展示项目进展、成果与价值。',
      items: [
        { name: '阶段性成果汇报', detail: '面向管理层或客户的里程碑成果演示和总结报告。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0VFRjJGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjM0I4MkY2JyBvcGFjaXR5PScuNyc+UHJvZ3Jlc3MgUmVwb3J0PC90ZXh0Pjwvc3ZnPg==', icon: 'images/doc-type-ppt.png?v=3' },
        { name: '项目验收报告', detail: '项目交付后的验收测试结果、交付清单、用户确认等。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0U4RjFGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMjU2M0VCJyBvcGFjaXR5PScuNyc+QWNjZXB0YW5jZSBSZXBvcnQ8L3RleHQ+PC9zdmc+', icon: 'images/doc-type-word.png?v=3' },
        { name: '项目复盘总结', detail: '项目结束后的经验总结、问题反思与改进建议，沉淀组织资产。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0VFRjJGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjM0I4MkY2JyBvcGFjaXR5PScuNyc+UmV0cm8gU3VtbWFyeTwvdGV4dD48L3N2Zz4=', icon: 'images/doc-type-word.png?v=3' },
        { name: '产品数据分析报告', detail: '基于核心业务指标的数据分析与产品优化建议。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0U4RjFGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjMjU2M0VCJyBvcGFjaXR5PScuNyc+RGF0YSBBbmFseXNpczwvdGV4dD48L3N2Zz4=', icon: 'images/doc-type-excel.png?v=3' }
      ]
    },
    '交付规范': {
      icon: '📖', color: '#7B3DFF',
      title: '交付规范',
      desc: '系统使用规范与培训材料，保障产品落地与用户上手。',
      items: [
        { name: '用户操作手册', detail: '面向终端用户的系统操作步骤说明，含截图和常见问题。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0YzRUVGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjN0MzQUVEJyBvcGFjaXR5PScuNyc+VXNlciBNYW51YWw8L3RleHQ+PC9zdmc+', icon: 'images/doc-type-word.png?v=3' },
        { name: '系统部署手册', detail: '面向运维人员的系统安装、配置、部署操作指南。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0VERTlGRScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjNkQyOEQ5JyBvcGFjaXR5PScuNyc+RGVwbG95IEd1aWRlPC90ZXh0Pjwvc3ZnPg==', icon: 'images/doc-type-word.png?v=3' },
        { name: '管理员配置指南', detail: '系统管理员的后台配置、权限管理、数据维护操作说明。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0YzRUVGRicvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjN0MzQUVEJyBvcGFjaXR5PScuNyc+QWRtaW4gR3VpZGU8L3RleHQ+PC9zdmc+', icon: 'images/doc-type-word.png?v=3' },
        { name: '培训PPT / 视频脚本', detail: '用于现场或远程培训的演示文稿和视频录制脚本。', img: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc4MDAnIGhlaWdodD0nNTAwJz48cmVjdCB3aWR0aD0nODAwJyBoZWlnaHQ9JzUwMCcgZmlsbD0nI0VERTlGRScvPjx0ZXh0IHg9JzUwJTI1JyB5PSc1MCUyNScgZG9taW5hbnQtYmFzZWxpbmU9J2NlbnRyYWwnIHRleHQtYW5jaG9yPSdtaWRkbGUnIGZvbnQtZmFtaWx5PSdJbnRlcixOb3RvIFNhbnMgU0Msc2Fucy1zZXJpZicgZm9udC1zaXplPSc2Mi41JyBmb250LXdlaWdodD0nNjAwJyBmaWxsPScjNkQyOEQ5JyBvcGFjaXR5PScuNyc+VHJhaW5pbmcgUFBUPC90ZXh0Pjwvc3ZnPg==', icon: 'images/doc-type-ppt.png?v=3' }
      ]
    }
  };
  /* Load custom doc descriptions */
  try { var cdd = JSON.parse(localStorage.getItem('_custom_doc_descs') || '{}'); Object.keys(cdd).forEach(function(k) { if (docData[k]) docData[k].desc = cdd[k]; }); } catch(ee) {}

  /* ==============================
     Copy to clipboard
     ============================== */
  window.copyToClipboard = function(text, el) {
    navigator.clipboard.writeText(text).then(function() {
      var toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = '<span class="toast-icon"><svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,4 3.5,6.5 9,1"/></svg></span>已复制';
      document.body.appendChild(toast);
      setTimeout(function() { toast.classList.add('show'); }, 10);
      setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, 1200);
    });
  };

  /* ==============================
     Filter
     ============================== */
  var filterBar = document.getElementById('filterBar');
  var navScrolled = document.getElementById('navScrolled');
  var nav = document.querySelector('.nav');
  var allCards = document.querySelectorAll('.card[data-cat], .doc-card[data-cat], .doc-visual-card[data-cat]');

  function handleFilterClick(btn) {
    var f = btn.dataset.filter;
    var target = btn.dataset.target;
    setActiveFilter(f, true);
    if (target) {
      var sec = document.getElementById(target);
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // hero filter bar clicks
  filterBar.addEventListener('click', function (e) {
    var btn = e.target.closest('.fbtn');
    if (btn) handleFilterClick(btn);
  });

  // nav tab clicks
  navScrolled.addEventListener('click', function (e) {
    var btn = e.target.closest('.ntab');
    if (btn) handleFilterClick(btn);
  });

  function setActiveFilter(f, dim) {
    // update hero filter buttons
    filterBar.querySelectorAll('.fbtn').forEach(function (b) { b.classList.remove('active'); });
    var fb = filterBar.querySelector('[data-filter="' + f + '"]');
    if (fb) fb.classList.add('active');
    // update nav tabs
    navScrolled.querySelectorAll('.ntab').forEach(function (b) { b.classList.remove('active'); });
    var nt = navScrolled.querySelector('[data-filter="' + f + '"]');
    if (nt) nt.classList.add('active');
    // dim/highlight cards only on click (dim=true)
    if (dim) {
      allCards.forEach(function (c) {
        if (c.dataset.cat === f) { c.classList.add('highlight'); c.classList.remove('dim'); }
        else { c.classList.add('dim'); c.classList.remove('highlight'); }
      });
    }
  }

  /* Nav scroll toggle */
  var hero = document.getElementById('hero');
  var navObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        nav.classList.remove('scrolled');
        filterBar.style.opacity = '1';
      } else {
        nav.classList.add('scrolled');
        filterBar.style.opacity = '0';
      }
    });
  }, { rootMargin: '-100px 0px 0px 0px' });
  navObserver.observe(hero);

  /* Scroll spy */
  var sections = [
    { id: 'design', filter: 'design' },
    { id: 'solution', filter: 'solution' },
    { id: 'doc', filter: 'doc' },
    { id: 'mgmt', filter: 'mgmt' },
    { id: 'about', filter: 'mgmt' }
  ];
  var scrollSpy = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var sec = sections.find(function (s) { return s.id === entry.target.id; });
        if (sec) setActiveFilter(sec.filter);
      }
    });
  }, { rootMargin: '-120px 0px -60% 0px' });

  sections.forEach(function (s) {
    var el = document.getElementById(s.id);
    if (el) scrollSpy.observe(el);
  });

  /* ==============================
     Modal — Project Cards
     ============================== */
  var modal = document.getElementById('modal');
  var modalBody = document.getElementById('modal-body');
  var modalX = document.querySelector('.modal-x');

  document.querySelectorAll('.card[data-project]').forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (card._skipClick) { card._skipClick = false; return; }
      if (card.querySelector('input, textarea')) return;
      // don't fire if clicking on a product item
      if (e.target.closest('li[data-product]')) return;
      var key = this.dataset.project;
      if (!data[key]) return;
      var d = data[key];

      /* mgmt / team — three separate step cards */
      if (key === 'mgmt' || key === 'team') {
        /* Load custom mgmt steps */
        var mgmtSteps = d.steps;
        try { var ms = JSON.parse(localStorage.getItem('_custom_mgmt_steps') || '{}'); if (ms[key]) mgmtSteps = ms[key]; } catch(ee) {}
        var headerHtml = '<h3>' + d.title + '</h3>';
        var bodyHtml = '<div class="mgmt-grid" data-mgmt-key="' + key + '">';
        mgmtSteps.forEach(function(s, idx) {
          bodyHtml += '<div class="mgmt-block">';
          bodyHtml += '<div class="mgmt-block-inner">';
          bodyHtml += '<span class="mgmt-block-bar" style="background:' + (s.grad || 'linear-gradient(180deg, #6366F1, #06B6D4, #10B981)') + '"></span>';
          bodyHtml += '<div class="mgmt-block-body">';
          bodyHtml += '<div class="mgmt-block-head">';
          bodyHtml += '<h4 class="mgmt-step-title" data-mgmt-key="' + key + '" data-step-idx="' + idx + '">' + s.title + '</h4>';
          var tagParts = (s.sub||'').split(' · ');
          bodyHtml += '<span class="mgmt-block-tags">';
          tagParts.forEach(function(tp, ti) {
            if (ti > 0) bodyHtml += ' · ';
            bodyHtml += '<span class="mgmt-tag-seg" data-mgmt-key="' + key + '" data-step-idx="' + idx + '" data-tag-seg="' + ti + '">' + tp + '</span>';
          });
          bodyHtml += '</span>';
          bodyHtml += '</div>';
          bodyHtml += '<p class="mgmt-step-body" data-mgmt-key="' + key + '" data-step-idx="' + idx + '">' + s.detail + '</p>';
          bodyHtml += '</div></div></div>';
        });
        bodyHtml += '</div>';
        var mb2=document.querySelector('.modal-box');mb2.classList.add('glass');mb2.classList.add('mgmt-modal');
        document.getElementById('modalHeaderContent').innerHTML = headerHtml;
        document.getElementById('modal-body').innerHTML = bodyHtml;
        document.getElementById('modal').classList.add('on');
        document.getElementById('modal').scrollTop = 0;
        document.body.style.overflow = 'hidden';
        return;
      }

      var logoHtml = d.logo ? (d.logoBg === false ? '<img src="' + d.logo + '" style="width:28px;height:28px;border-radius:6px;object-fit:contain;flex-shrink:0">' : '<span style="width:28px;height:28px;border-radius:6px;flex-shrink:0;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.04)"><img src="' + d.logo + '" style="width:22px;height:22px;object-fit:contain"></span>') : '';
      var headerHtml2 = '<div style="display:flex;align-items:center;gap:10px">' + logoHtml + '<h3 style="margin:0">' + d.title + '</h3></div>';
      var bodyHtml2 = '';
      /* Load custom solution data */
      var slnCustom = {}; try { slnCustom = JSON.parse(localStorage.getItem('_custom_sln_data') || '{}'); } catch(ee) {}
      var slnData = slnCustom[key] || { desc: d.desc, sections: (d.sections||[]).map(function(s){return {h:s.h, b:s.b};}) };
      if (slnData.desc) bodyHtml2 += '<p class="sln-desc-text" data-sln-key="' + key + '" style="color:var(--text2);font-size:12px;margin:0 0 10px 0;line-height:1.55;padding:8px 14px;background:rgba(0,85,255,.02);border:1px solid rgba(0,0,0,.04);border-radius:6px;">' + slnData.desc + '</p>';
      bodyHtml2 += '<div class="sln-sections-wrap" data-sln-key="' + key + '">';
      (slnData.sections||[]).forEach(function (s, idx) {
        bodyHtml2 += '<div class="msec sln-section" data-section-idx="' + idx + '" style="margin-bottom:12px"><h4 class="sln-sec-title">' + s.h + '</h4><p class="sln-sec-body">' + s.b + '</p><button class="sln-sec-del" onclick="event.stopPropagation();window._delSlnSection(\x27' + key + '\x27,' + idx + ')" style="display:none;position:absolute;top:0;right:0;width:18px;height:18px;border-radius:50%;background:#EF4444;color:#fff;border:none;cursor:pointer;font-size:10px;line-height:1;padding:0">&times;</button></div>';
      });
      bodyHtml2 += '<span class="sln-sec-add" data-sln-key="' + key + '" style="display:inline-block;font-size:11px;font-weight:400;color:var(--text3);padding:2px 8px;border-radius:20px;background:transparent;border:1px solid rgba(0,0,0,.1);cursor:pointer;margin-bottom:14px">+ 添加</span>';
      bodyHtml2 += '</div>';

      var slnKey = 'sln_file_' + key;
      function isSlnObj(f) { return f && typeof f === 'object' && f.type; }
      function slnData(f) { return isSlnObj(f) ? f.data : f; }
      function slnType(f) { return isSlnObj(f) ? f.type : 'image'; }
      function slnName(f) { return isSlnObj(f) ? (f.name || '') : ''; }

      function renderSlnModal(currentFiles) {
        /* Normalize: legacy strings → {type:'image',data:...} */
        var uploaded = Array.isArray(currentFiles) ? currentFiles.map(function(f) {
          return isSlnObj(f) ? f : {type:'image', data:f};
        }) : [];
        var isCustom = uploaded.length > 0;

        var imgHtml = '<div class="msec"><h4 style="display:flex;align-items:center;justify-content:space-between;font-size:14px">方案展示 <label class="img-edit-toggle" title="上传文件" style="cursor:pointer;display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--text3);font-weight:400;padding:2px 8px;border-radius:20px;border:1px solid rgba(0,0,0,.1)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> 上传<input type="file" accept="image/*,.pdf,.docx,.doc,.ppt,.pptx" multiple style="display:none" onchange="window._slnUpload(event,\x27' + slnKey + '\x27)"></label></h4>';
        imgHtml += '<div class="img-scroll" id="sln-scroll-' + key + '" style="display:' + (isCustom ? 'flex' : 'none') + ';gap:14px;overflow-x:auto;padding:8px 0;width:100%">';
        if (isCustom) {
          uploaded.forEach(function(f, idx) {
            var isPdf = slnType(f) === 'pdf';
            var isWord = slnType(f) === 'word';
            var isPpt = slnType(f) === 'ppt';
            imgHtml += '<div style="position:relative;flex-shrink:0" onmouseenter="var b=this.querySelector(\x27.dg-del-btn\x27);if(b)b.style.opacity=\x271\x27" onmouseleave="var b=this.querySelector(\x27.dg-del-btn\x27);if(b)b.style.opacity=\x270\x27">';
            if (isPdf || isWord || isPpt) {
              var iconSrc = isPdf ? 'images/doc-type-pdf.png' : isWord ? 'images/doc-type-word.png' : 'images/doc-type-ppt.png';
              var label = isPdf ? (slnName(f) || 'PDF 文件') : isWord ? (slnName(f) || 'Word 文件') : (slnName(f) || 'PPT 文件');
              imgHtml += '<div onclick="event.stopPropagation();window._openSlnPreview(\x27' + slnKey + '\x27,' + idx + ')" style="width:160px;height:130px;border-radius:10px;cursor:pointer;background:linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,.5)),url(images/sln-cover-bg.png) center/cover no-repeat;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.5);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;transition:all .25s ease" onmouseenter="this.style.transform=\x27translateY(-5px)\x27" onmouseleave="this.style.transform=\x27translateY(0)\x27"><img src="' + iconSrc + '" style="width:36px;height:36px;object-fit:contain" alt=""><span style="font-size:10px;color:var(--text2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + label + '</span></div>';
            } else {
              imgHtml += '<img src="' + slnData(f) + '" alt="" loading="lazy" style="width:200px;height:130px;object-fit:contain;border-radius:10px;cursor:pointer;background:rgba(0,0,0,.02);transition:all .25s ease" onmouseenter="this.style.transform=\x27translateY(-5px)\x27" onmouseleave="this.style.transform=\x27translateY(0)\x27" onclick="event.stopPropagation();window._openSlnPreview(\x27' + slnKey + '\x27,' + idx + ')" onerror="this.style.display=\x27none\x27">';
            }
            if (isCustom) {
              imgHtml += '<button class="dg-del-btn" style="position:absolute;top:4px;right:4px;opacity:0;transition:opacity .2s" onclick="event.stopPropagation();window._slnFileDel(\x27' + slnKey + '\x27,' + idx + ')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>';
            }
            imgHtml += '</div>';
          });
        }
        imgHtml += '</div>';
        imgHtml += '</div>';
        
document.querySelector('.modal-box').classList.add('glass');
        document.getElementById('modalHeaderContent').innerHTML = headerHtml2;
        document.getElementById('modal-body').innerHTML = bodyHtml2 + imgHtml;
        document.getElementById('modal').classList.add('on');
        document.getElementById('modal').scrollTop = 0;
        document.body.style.overflow = 'hidden';
      }

      window._slnGetImgs = function(k) {
        var r = sessionStorage.getItem(k) || localStorage.getItem(k);
        if (!r) return (d.imgs || []).map(function(x){return {type:'image',data:x}});
        try { var a = JSON.parse(r); if (!Array.isArray(a) || !a.length) return (d.imgs || []).map(function(x){return {type:'image',data:x}}); return a; }
        catch(ee) { return (d.imgs || []).map(function(x){return {type:'image',data:x}}); }
      };

      /* Load: new key → old key fallback */
      _prodDBLoad(slnKey, function(dbFiles) {
        if (dbFiles && dbFiles.length) { renderSlnModal(dbFiles); return; }
        var oldKey = 'sln_img_' + key;
        _prodDBLoad(oldKey, function(oldData) {
          if (oldData && oldData.length) {
            renderSlnModal(oldData);
          } else {
            var raw = sessionStorage.getItem(slnKey) || sessionStorage.getItem(oldKey);
            var files = [];
            if (raw) { try { files = JSON.parse(raw); } catch(ee) {} }
            renderSlnModal(files);
          }
        });
      });
    });
  });

  /* ==============================
     Modal — Product Items
     ============================== */
  document.querySelector('#design').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-product]');
    if (!li) return;
    var card = li.closest('.doc-card');
    if (card && card._skipClick) { card._skipClick = false; return; }
    if (card && card.querySelector('input, textarea')) return;
    e.stopPropagation();
    var key = li.dataset.product;
    var pd = productData[key];
    if (!pd) return;

    /* Load custom overrides from localStorage */
    var customDescs = {}; try { customDescs = JSON.parse(localStorage.getItem('_custom_prod_descs') || '{}'); } catch(ee) {}
    var customMetrics = {}; try { customMetrics = JSON.parse(localStorage.getItem('_custom_prod_metrics') || '{}'); } catch(ee) {}
    var hasCustom = customDescs.hasOwnProperty(key);
    var desc = hasCustom ? customDescs[key] : pd.desc;
    if (!hasCustom && pd.outputs && pd.outputs.length) { desc += ' ' + pd.outputs.map(function(o){return o.detail}).join('；'); }
    var metrics = (customMetrics.hasOwnProperty(key)) ? customMetrics[key].slice() : (pd.metrics ? pd.metrics.slice() : []);

    var dotColor = '#0055FF';
    var tagBg = 'rgba(0,85,255,.08)';
    var titleHtml = '<div style="display:flex;align-items:center;gap:12px;">';
    if (pd.logo) { var logoSize = pd.logoSize || 32; var logoWrap = pd.logoBg ? 'background:#fff;padding:4px;box-shadow:0 1px 3px rgba(0,0,0,.04);' : ''; titleHtml += '<span style="flex-shrink:0;display:flex;align-items:center;justify-content:center;width:' + logoSize + 'px;height:' + logoSize + 'px;border-radius:7px;' + logoWrap + '"><img src="' + pd.logo + '" style="width:100%;height:100%;object-fit:contain;"></span>'; }
    titleHtml += '<h3 style="margin:0;">' + (customDesignItems[key] || pd.name) + '</h3></div>';
    var bodyHtml = '<p class="prod-desc-text" data-prod-key="' + key + '" style="color:var(--text2);font-size:12px;margin:0 0 14px 0;line-height:1.55;padding:8px 14px;background:rgba(0,85,255,.02);border:1px solid rgba(0,0,0,.04);border-radius:6px;">' + desc + '</p>';
    /* Metrics with add/delete/edit */
    bodyHtml += '<div class="prod-metrics-wrap" data-prod-key="' + key + '" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:10px">';
    metrics.forEach(function(m, idx){
      bodyHtml += '<span class="prod-metric-tag" data-metric-idx="' + idx + '" style="font-size:11px;font-weight:600;color:' + dotColor + ';padding:3px 10px;border-radius:99px;background:' + tagBg + ';border:1px solid ' + dotColor + '22;position:relative;cursor:default">' + m + '<button class="prod-metric-del" onclick="event.stopPropagation();window._delProdMetric(\x27' + key + '\x27,' + idx + ')" style="display:none;position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;background:#EF4444;color:#fff;border:none;cursor:pointer;font-size:10px;line-height:1;padding:0">&times;</button></span>';
    });
    bodyHtml += '<span class="prod-metric-add" data-prod-key="' + key + '" style="font-size:11px;font-weight:400;color:var(--text3);padding:3px 10px;border-radius:99px;background:transparent;border:1px solid rgba(0,0,0,.1);cursor:pointer;user-select:none">+ 添加</span>';
    bodyHtml += '</div>';
    /* Store key on bodyHtml wrapper for later reference */
    bodyHtml = '<div data-prod-key="' + key + '">' + bodyHtml;
    var productKey = 'prod_imgs_' + key;
    // Render modal with given images array
    function renderProductModal(currentImgs) {
      var hasUploads = currentImgs && currentImgs.length > 0;
      var imagesHtml = '<div class="msec"><h4 style="display:flex;align-items:center;justify-content:space-between;font-size:14px">产品展示 <label class="img-edit-toggle" title="上传图片" style="cursor:pointer;display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--text3);font-weight:400;padding:2px 8px;border-radius:20px;border:1px solid rgba(0,0,0,.1)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg> 上传<input type="file" accept="image/*,.pdf,.docx,.doc,.ppt,.pptx" multiple style="display:none" onchange="window._prodUpload(event,\x27' + productKey + '\x27)"></label></h4><div class="img-scroll" id="prod-scroll-' + key + '" style="display:' + (hasUploads ? 'flex' : 'none') + ';gap:8px;overflow-x:auto;padding:8px 0;width:100%">';
      if (hasUploads) {
        currentImgs.forEach(function(img, idx){
          imagesHtml += '<div style="position:relative;flex-shrink:0" onmouseenter="var b=this.querySelector(\x27.dg-del-btn\x27);if(b)b.style.opacity=\x271\x27" onmouseleave="var b=this.querySelector(\x27.dg-del-btn\x27);if(b)b.style.opacity=\x270\x27"><img src="' + img + '" alt="" loading="lazy" style="width:200px;height:130px;object-fit:contain;border-radius:10px;cursor:pointer;background:rgba(0,0,0,.02)" onclick="event.stopPropagation();openLightbox(this.src,' + JSON.stringify(currentImgs).replace(/"/g,'&quot;') + ')" onerror="this.style.display=\x27none\x27"><button class="dg-del-btn" style="position:absolute;top:4px;right:4px;z-index:10;opacity:0;transition:opacity .2s" onclick="event.stopPropagation();window._prodDelImg(\x27' + productKey + '\x27,' + idx + ')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button></div>';
        });
      }
      imagesHtml += '</div></div>';
      var mb3=document.querySelector('.modal-box');mb3.classList.add('glass');mb3.classList.add('prod-modal');
      document.getElementById('modalHeaderContent').innerHTML = titleHtml;
      document.getElementById('modal-body').innerHTML = bodyHtml + imagesHtml + '</div>';
      _injectScrollArrows();
      document.getElementById('modal').classList.add('on');
      document.getElementById('modal').scrollTop = 0;
      document.body.style.overflow = 'hidden';
    }
    // Try IndexedDB first → sessionStorage → localStorage (cloud sync fallback)
    _prodDBLoad(productKey, function(dbImgs) {
      if (dbImgs && dbImgs.length) {
        renderProductModal(dbImgs);
      } else {
        var imgs = [];
        var ssRaw = sessionStorage.getItem(productKey);
        if (ssRaw) { try { imgs = JSON.parse(ssRaw); } catch(ee) {} }
        if (!imgs.length) {
          var lsRaw = localStorage.getItem(productKey);
          if (lsRaw) {
            try {
              var parsed = JSON.parse(lsRaw);
              if (Array.isArray(parsed) && parsed.length && parsed[0] !== '__IDB__') {
                imgs = parsed;
                _prodDBSave(productKey, imgs);
              }
            } catch(ee) {}
          }
        }
        renderProductModal(imgs);
      }
    });
  });

  // Lightbox with gallery navigation
  var lightboxImages = [];
  var lightboxIndex = 0;
  var lightboxDelKey = null;
  var lightboxDelCardIdx = -1;

  window.openLightbox = function(src, imgs, delKey, delCardIdx) {
    if (typeof imgs === 'string') { try { imgs = JSON.parse(imgs); } catch(ee) { imgs = null; } }
    lightboxImages = (Array.isArray(imgs) && imgs.length) ? imgs : [src];
    lightboxIndex = lightboxImages.indexOf(src);
    if (lightboxIndex < 0) lightboxIndex = 0;
    lightboxDelKey = delKey || null;
    lightboxDelCardIdx = (typeof delCardIdx !== 'undefined') ? delCardIdx : -1;
    showLightbox();
  };

  function showLightbox() {
    var existing = document.querySelector('.lightbox');
    if (existing) existing.remove();
    removeArrowButtons();

    var lb = document.createElement('div'); lb.className = 'lightbox';

    /* 代表设计预览：顶部导航栏 */
    if (lightboxDelKey) {
      var bar = document.createElement('div'); bar.className = 'doc-lb-bar'; bar.style.zIndex = '1002';
      var barL = document.createElement('div'); barL.className = 'doc-lb-bar-left';
      var cardName = '';
      if (lightboxDelCardIdx >= 0) {
        var cardEl = document.querySelectorAll('.design-gallery-item')[lightboxDelCardIdx];
        if (cardEl) { var strong = cardEl.querySelector('.dg-info strong'); if (strong) cardName = strong.textContent.trim(); }
      }
      barL.innerHTML = '<span class="doc-lb-name">' + (cardName || '代表设计') + '</span><span class="doc-lb-count">' + (lightboxImages.length > 0 ? (lightboxIndex+1) + ' / ' + lightboxImages.length : '0 / 0') + '</span>';
      bar.appendChild(barL);
      var barR = document.createElement('div'); barR.style.cssText = 'display:flex;align-items:center;gap:8px';
      /* 删除按钮 */
      if (!document.body.classList.contains('edit-locked')) {
        var delBtn = document.createElement('button'); delBtn.className = 'doc-lb-del-btn'; delBtn.title = '删除当前图片';
        delBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
        delBtn.onclick = function(e) { e.stopPropagation();
          if (lightboxImages.length <= 1) { localStorage.removeItem(lightboxDelKey); if (_prodDB) { var t2=_prodDB.transaction('imgs','readwrite'); t2.objectStore('imgs').delete(lightboxDelKey); } var c3=document.querySelectorAll('.design-gallery-item')[lightboxDelCardIdx]; if(c3)_refreshDesignCard(c3,lightboxDelCardIdx,lightboxDelKey,[]); lb.remove(); removeArrowButtons(); return; }
          lightboxImages.splice(lightboxIndex,1); localStorage.setItem(lightboxDelKey,JSON.stringify(lightboxImages)); _prodDBSave(lightboxDelKey,lightboxImages); var c4=document.querySelectorAll('.design-gallery-item')[lightboxDelCardIdx]; if(c4)_refreshDesignCard(c4,lightboxDelCardIdx,lightboxDelKey,lightboxImages); if(lightboxIndex>=lightboxImages.length)lightboxIndex=lightboxImages.length-1; showLightbox();
        };
        barR.appendChild(delBtn);
      }
      var cb3 = document.createElement('button'); cb3.className = 'doc-lb-close'; cb3.innerHTML = '&times;';
      cb3.onclick = function(e) { e.stopPropagation(); lb.remove(); removeArrowButtons(); };
      barR.appendChild(cb3); bar.appendChild(barR); lb.appendChild(bar);
    }

    var img = document.createElement('img'); img.src = lightboxImages[lightboxIndex];
    lb.appendChild(img);
    lb.addEventListener('click', function(e) { if (e.target === lb) { lb.remove(); removeArrowButtons(); } });
    document.body.appendChild(lb);

    if (lightboxImages.length > 1) {
      var prevBtn = document.createElement('button'); prevBtn.className = 'lb-prev'; prevBtn.textContent = '‹';
      var nextBtn = document.createElement('button'); nextBtn.className = 'lb-next'; nextBtn.textContent = '›';
      var counter = document.createElement('span'); counter.className = 'lb-counter'; counter.textContent = (lightboxIndex+1) + '/' + lightboxImages.length;
      prevBtn.onclick = function(e) { e.stopPropagation(); lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length; showLightbox(); };
      nextBtn.onclick = function(e) { e.stopPropagation(); lightboxIndex = (lightboxIndex + 1) % lightboxImages.length; showLightbox(); };
      document.body.appendChild(prevBtn);
      document.body.appendChild(nextBtn);
      document.body.appendChild(counter);
    }
  }

  function removeArrowButtons() {
    document.querySelectorAll('.lb-prev, .lb-next, .lb-counter, .lb-del-btn, .doc-lb-del-btn').forEach(function(el) { el.remove(); });
  }

  document.addEventListener('keydown', function(e) {
    var lb = document.querySelector('.lightbox');
    if (!lb) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length; showLightbox(); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); lightboxIndex = (lightboxIndex + 1) % lightboxImages.length; showLightbox(); }
    if (e.key === 'Escape') { lb.remove(); removeArrowButtons(); }
  });

  /* ==============================
     Custom Document Card Titles (double-click to edit)
     ============================== */
  var CUSTOM_DOC_TITLES_KEY = '_custom_doc_titles';
  var customDocTitles = {};
  try {
    var savedTitles = localStorage.getItem(CUSTOM_DOC_TITLES_KEY);
    if (savedTitles) customDocTitles = JSON.parse(savedTitles);
  } catch(e) {}

  function applyCustomDocTitles() {
    document.querySelectorAll('#doc .doc-visual-card h4[data-doc-title]').forEach(function(h4) {
      var k = h4.getAttribute('data-doc-title');
      if (k && customDocTitles[k]) h4.textContent = customDocTitles[k];
    });
  }
  applyCustomDocTitles();

  /* ---- Custom Document Item Names ---- */
  var CUSTOM_DOC_ITEMS_KEY = '_custom_doc_items';
  var customDocItems = {};
  try {
    var savedItems = localStorage.getItem(CUSTOM_DOC_ITEMS_KEY);
    if (savedItems) customDocItems = JSON.parse(savedItems);
  } catch(e) {}

  function applyCustomDocItems() {
    document.querySelectorAll('#doc .doc-visual-card').forEach(function(card) {
      var h4 = card.querySelector('h4[data-doc-title]');
      if (!h4) return;
      var catKey = h4.getAttribute('data-doc-title');
      var catItems = customDocItems[catKey];
      if (!catItems) return;
      card.querySelectorAll('li[data-doc-item]').forEach(function(li) {
        var idx = li.getAttribute('data-doc-item');
        var saved = catItems[idx]; if (!saved) return; li.textContent = (typeof saved === 'object') ? saved.name : saved;
      });
    });
  }
  applyCustomDocItems();

  /* long-press → edit title / item name */
  var _pressTimer = null, _pressTarget = null;

  document.getElementById('doc').addEventListener('mousedown', function(e) {
    if (document.body.classList.contains('edit-locked')) return;
    var el = e.target.closest('.doc-visual-card h4[data-doc-title], .doc-visual-card li[data-doc-item]');
    if (!el) return;
    _pressTarget = el;
    _pressTimer = setTimeout(function() {
      _pressTimer = null;
      var card = el.closest('.doc-visual-card');
      if (card) card._skipClick = true;
      startEdit(el);
    }, 500);
  });

  document.addEventListener('mouseup', function() {
    if (_pressTimer) { clearTimeout(_pressTimer); _pressTimer = null; _pressTarget = null; }
  });

  document.addEventListener('click', function(e) {
    // click outside editing input → close edit
    if (_pressTarget && !e.target.closest('input') && !e.target.closest('.doc-visual-card h4[data-doc-title], .doc-visual-card li[data-doc-item]')) {
      var inp = document.querySelector('#doc input._edit-input');
      if (inp) inp.blur();
    }
  });

  /* doc type icons */
  var DOC_TYPES = [
    { key:'word',  label:'Word',  color:'#2563EB', bg:'#DBEAFE' },
    { key:'excel', label:'Excel', color:'#059669', bg:'#D1FAE5' },
    { key:'pdf',   label:'PDF',   color:'#DC2626', bg:'#FEE2E2' },
    { key:'ppt',   label:'PPT',   color:'#EA580C', bg:'#FFEDD5' },
    { key:'img',   label:'图片',  color:'#7C3AED', bg:'#EDE9FE' }
  ];
  var _iconVer = '?v=3';
  function _getDocTypeIcon(key) {
    var map = {
      word: 'images/doc-type-word.png' + _iconVer, excel: 'images/doc-type-excel.png' + _iconVer,
      pdf: 'images/doc-type-pdf.png' + _iconVer, ppt: 'images/doc-type-ppt.png' + _iconVer,
      img: 'images/doc-type-img.png' + _iconVer
    };
    return map[key] || '';
  }

  function startEdit(el) {
    if (el.querySelector('input')) return;

    var isH4 = el.matches('h4');
    var oldVal = el.textContent.trim();
    var key, idx, catKey, curTypes = [];

    if (isH4) {
      key = el.getAttribute('data-doc-title');
    } else {
      idx = el.getAttribute('data-doc-item');
      var card = el.closest('.doc-visual-card');
      var h4 = card.querySelector('h4[data-doc-title]');
      catKey = h4.getAttribute('data-doc-title');
      var saved = customDocItems[catKey] && customDocItems[catKey][idx];
      if (saved && typeof saved === 'object') {
        curTypes = Array.isArray(saved.type) ? saved.type.slice() : (saved.type ? [saved.type] : []);
        oldVal = saved.name || oldVal;
      }
    }

    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;width:100%';

    var input = document.createElement('input');
    input.type = 'text'; input.value = oldVal;
    input.className = '_edit-input';
    if (isH4) {
      input.style.cssText = 'font-size:13px;font-weight:700;color:#2D4965;border:1px solid #6366F1;border-radius:6px;padding:2px 6px;width:100%;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;';
    } else {
      input.style.cssText = 'font-size:11.5px;color:var(--text2);border:1px solid #6366F1;border-radius:4px;padding:3px 6px;width:100%;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;';
    }
    wrap.appendChild(input);

    /* type selector — one row, equal width, light bg + border */
    var typeRow = null;
    if (!isH4) {
      typeRow = document.createElement('div');
      typeRow.style.cssText = 'display:flex;gap:0;width:100%';
      DOC_TYPES.forEach(function(t, ti) {
        var btn = document.createElement('button');
        btn.textContent = t.key === 'img' ? 'i' : t.key.charAt(0).toUpperCase();
        btn.type = 'button';
        btn.style.cssText = 'flex:1;font-size:10px;font-weight:700;padding:3px 0;border:1px solid rgba(0,0,0,.1);border-right:' + (ti < 4 ? 'none' : '1px solid rgba(0,0,0,.1)') + ';cursor:pointer;color:' + t.color + ';background:' + t.bg + ';text-align:center;margin:0;border-radius:0;';
        if (ti === 0) btn.style.borderRadius = '4px 0 0 4px';
        if (ti === 4) btn.style.borderRadius = '0 4px 4px 0';
        if (curTypes.indexOf(t.key) >= 0) {
          btn.style.color = '#fff';
          btn.style.background = t.color;
          btn.style.borderColor = t.color;
        }
        btn.addEventListener('mousedown', function(ev) { ev.preventDefault(); });
        btn.addEventListener('click', function(ev2) {
          ev2.stopPropagation();
          var idx2 = curTypes.indexOf(t.key);
          if (idx2 >= 0) { curTypes.splice(idx2, 1); } else { curTypes.push(t.key); }
          typeRow.querySelectorAll('button').forEach(function(b, bi) {
            var dt = DOC_TYPES[bi];
            var s = curTypes.indexOf(dt.key) >= 0;
            b.style.color = s ? '#fff' : dt.color;
            b.style.background = s ? dt.color : dt.bg;
            b.style.borderColor = s ? dt.color : 'rgba(0,0,0,.1)';
            b.style.borderRight = (bi < 4 && !s) ? 'none' : '1px solid ' + (s ? dt.color : 'rgba(0,0,0,.1)');
          });
          input.focus();
        });
        typeRow.appendChild(btn);
      });
      wrap.appendChild(typeRow);
    }

    el.textContent = ''; el.appendChild(wrap);
    input.focus(); input.select();

    function save() {
      var newVal = input.value.trim();
      if (isH4) {
        if (newVal && newVal !== key) { customDocTitles[key] = newVal; }
        else { delete customDocTitles[key]; }
        _saveCustomData(CUSTOM_DOC_TITLES_KEY, customDocTitles)
        el.textContent = newVal || key;
      } else {
        if (!customDocItems[catKey]) customDocItems[catKey] = {};
        if (newVal || curTypes.length) {
          customDocItems[catKey][idx] = { name: newVal || docData[catKey].items[parseInt(idx)].name, type: curTypes };
        } else {
          delete customDocItems[catKey][idx];
          if (Object.keys(customDocItems[catKey]).length === 0) delete customDocItems[catKey];
        }
        _saveCustomData(CUSTOM_DOC_ITEMS_KEY, customDocItems)
        el.textContent = newVal || docData[catKey].items[parseInt(idx)].name;
      }
      _pressTarget = null;
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { input.blur(); }
      if (ev.key === 'Escape') { input.value = oldVal; input.blur(); }
    });
  }

  /* ---- Management Card Titles — long-press to edit, sync to modal ---- */
  var CUSTOM_MGMT_TITLES_KEY = '_custom_mgmt_titles';
  var CUSTOM_MGMT_DESCS_KEY = '_custom_mgmt_descs';
  var customMgmtTitles = {};
  var customMgmtDescs = {};
  try { var mt = localStorage.getItem(CUSTOM_MGMT_TITLES_KEY); if (mt) customMgmtTitles = JSON.parse(mt); } catch(e) {}
  try { var md = localStorage.getItem(CUSTOM_MGMT_DESCS_KEY); if (md) customMgmtDescs = JSON.parse(md); } catch(e) {}
  /* Apply custom descs on page load */
  document.querySelectorAll('.mgmt-desc-text[data-mgmt-key]').forEach(function(dp) {
    var key = dp.getAttribute('data-mgmt-key');
    if (customMgmtDescs[key]) dp.textContent = customMgmtDescs[key];
  });

  function applyMgmtTitles() {
    Object.keys(customMgmtTitles).forEach(function(k) {
      if (data[k]) data[k].title = customMgmtTitles[k];
    });
    document.querySelectorAll('h3[data-mgmt-key] .mgmt-title-text').forEach(function(sp) {
      var key = sp.closest('h3').getAttribute('data-mgmt-key');
      if (customMgmtTitles[key]) sp.textContent = customMgmtTitles[key];
    });
  }
  applyMgmtTitles();

  document.addEventListener('mousedown', function(e) {
    if (document.body.classList.contains('edit-locked')) return;
    var sp = e.target.closest('.mgmt-title-text');
    var dp = e.target.closest('.mgmt-desc-text');
    if (!sp && !dp) return;
    var card = (sp||dp).closest('.mgmt-card');
    var isTitle = !!sp;
    var el = sp || dp;
    var key = el.getAttribute('data-mgmt-key');
    var oldVal = (isTitle ? sp : dp).textContent.trim();
    var timer = setTimeout(function() {
      if (card) card._skipClick = true;
      var input = document.createElement(isTitle ? 'input' : 'textarea');
      if (isTitle) {
        input.type = 'text'; input.value = oldVal;
        input.style.cssText = 'font-size:15px;font-weight:600;color:#2D4965;border:1px solid #6366F1;border-radius:6px;padding:2px 6px;width:100%;max-width:260px;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;font-family:inherit;';
        sp.style.display = 'none';
        sp.parentNode.insertBefore(input, sp.nextSibling);
      } else {
        input.value = oldVal;
        input.style.cssText = 'font-size:12px;color:var(--text2);line-height:1.6;border:1px solid #6366F1;border-radius:6px;padding:4px 8px;width:100%;min-height:40px;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;font-family:inherit;resize:vertical;';
        dp.textContent = '';
        dp.appendChild(input);
      }
      input.focus(); input.select();
      function save() {
        var newVal = input.value.trim();
        if (isTitle) {
          if (newVal && newVal !== oldVal) { customMgmtTitles[key] = newVal; }
          else { delete customMgmtTitles[key]; }
          _saveCustomData(CUSTOM_MGMT_TITLES_KEY, customMgmtTitles)
          sp.textContent = newVal || oldVal;
          sp.style.display = '';
          input.remove();
          if (data[key]) data[key].title = newVal || oldVal;
        } else {
          // Save desc to same store
          var descs = {}; try { descs = JSON.parse(localStorage.getItem('_custom_mgmt_descs') || '{}'); } catch(ee) {}
          if (newVal && newVal !== oldVal) { descs[key] = newVal; }
          else { delete descs[key]; }
          _saveCustomData('_custom_mgmt_descs', descs)
          dp.textContent = newVal || oldVal;
        }
      }
      input.addEventListener('blur', save);
      input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter' && !ev.shiftKey && isTitle) input.blur(); if (ev.key === 'Escape') { input.value = oldVal; input.blur(); } });
    }, 500);
    var onUp = function() { clearTimeout(timer); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mouseup', onUp);
  });

  /* ---- Solution Card Titles — long-press to edit ---- */
  document.addEventListener('mousedown', function(e) {
    if (document.body.classList.contains('edit-locked')) return;
    var h3 = e.target.closest('.sln-card-title');
    var chipSeg = e.target.closest('.sln-chip-seg');
    var desc = e.target.closest('.sln-card-desc');
    if (!h3 && !chipSeg && !desc) return;
    var el = h3 || chipSeg || desc;
    var key = el.closest('[data-sln-card-key]').getAttribute('data-sln-card-key');
    var card = el.closest('.card');
    var oldVal = el.textContent.trim();
    var isTextarea = !!desc;
    var segIdx = chipSeg ? parseInt(chipSeg.getAttribute('data-chip-seg')) : -1;
    var timer = setTimeout(function() {
      if (card) card._skipClick = true;
      var input;
      if (isTextarea) {
        input = document.createElement('textarea');
        input.value = oldVal;
        input.style.cssText = 'font-size:12px;color:var(--text2);line-height:1.55;border:1px solid #6366F1;border-radius:6px;padding:4px 8px;width:100%;min-height:36px;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;font-family:inherit;resize:vertical;';
      } else {
        input = document.createElement('input');
        input.type = 'text'; input.value = oldVal;
        input.style.cssText = 'font-size:15px;font-weight:600;color:#0F1419;border:1px solid #6366F1;border-radius:6px;padding:2px 6px;width:100%;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;font-family:inherit;';
      }
      el.textContent = ''; el.appendChild(input);
      input.focus(); input.select();
      function save() {
        var newVal = input.value.trim();
        var storeKey = isTextarea ? '_custom_sln_card_descs' : (chipSeg ? '_custom_sln_chips' : '_custom_sln_titles');
        var stored = {}; try { stored = JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch(ee) {}
        if (chipSeg && segIdx >= 0) {
          if (!Array.isArray(stored[key])) {
            var defaults = el.closest('.card-chip').querySelectorAll('.sln-chip-seg');
            stored[key] = []; defaults.forEach(function(s) { stored[key].push(s.textContent.trim()); });
          }
          stored[key][segIdx] = newVal || oldVal;
        } else {
          if (newVal && newVal !== oldVal) { stored[key] = newVal; }
          else { delete stored[key]; }
        }
        _saveCustomData(storeKey, stored)
        el.textContent = newVal || oldVal;
      }
      input.addEventListener('blur', save);
      input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter' && !isTextarea) input.blur(); if (ev.key === 'Escape') { input.value = oldVal; input.blur(); } });
    }, 500);
    var onUp = function() { clearTimeout(timer); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mouseup', onUp);
  });
  /* Apply custom solution titles/chips/descs on load */
  (function() {
    var titles = {}; try { titles = JSON.parse(localStorage.getItem('_custom_sln_titles') || '{}'); } catch(ee) {}
    var chips = {}; try { chips = JSON.parse(localStorage.getItem('_custom_sln_chips') || '{}'); } catch(ee) {}
    var descs = {}; try { descs = JSON.parse(localStorage.getItem('_custom_sln_card_descs') || '{}'); } catch(ee) {}
    Object.keys(titles).forEach(function(k) { if (data[k]) data[k].title = titles[k]; });
    document.querySelectorAll('.sln-card-title[data-sln-card-key]').forEach(function(el) {
      var k = el.getAttribute('data-sln-card-key');
      if (titles[k]) el.textContent = titles[k];
    });
    document.querySelectorAll('.card-chip[data-sln-card-key]').forEach(function(el) {
      var k = el.getAttribute('data-sln-card-key');
      if (Array.isArray(chips[k])) {
        var segs = el.querySelectorAll('.sln-chip-seg');
        segs.forEach(function(s, i) { if (chips[k][i]) s.textContent = chips[k][i]; });
      }
    });
    document.querySelectorAll('.sln-card-desc[data-sln-card-key]').forEach(function(el) {
      var k = el.getAttribute('data-sln-card-key');
      if (descs[k]) el.textContent = descs[k];
    });
  })();

  /* ---- Section Titles — long-press to edit h2 headings, sync nav/filter ---- */
  var CUSTOM_SEC_TITLES_KEY = '_custom_sec_titles';
  var customSecTitles = {};
  try { var st = localStorage.getItem(CUSTOM_SEC_TITLES_KEY); if (st) customSecTitles = JSON.parse(st); } catch(e) {}

  function applySecTitles() {
    var defaults = { design: '产品选集', solution: '方案设计', doc: '文档撰写', mgmt: '项目管理' };
    /* Section h2 */
    document.querySelectorAll('h2[data-section-key]').forEach(function(h2) {
      var k = h2.getAttribute('data-section-key');
      h2.textContent = customSecTitles[k] || defaults[k] || h2.textContent;
    });
    /* Filter buttons */
    document.querySelectorAll('.fbtn[data-filter]').forEach(function(fb) {
      var k = fb.getAttribute('data-filter');
      if (customSecTitles[k]) {
        var dot = fb.querySelector('.fdot');
        fb.textContent = ''; if (dot) fb.appendChild(dot);
        fb.appendChild(document.createTextNode(customSecTitles[k]));
      }
    });
    /* Nav tabs */
    document.querySelectorAll('.ntab[data-filter]').forEach(function(nt) {
      var k = nt.getAttribute('data-filter');
      if (customSecTitles[k]) {
        var dot = nt.querySelector('.fdot');
        nt.textContent = ''; if (dot) nt.appendChild(dot);
        nt.appendChild(document.createTextNode(customSecTitles[k]));
      }
    });
  }
  applySecTitles();

  document.addEventListener('mousedown', function(e) {
    if (document.body.classList.contains('edit-locked')) return;
    var h2 = e.target.closest('h2[data-section-key]');
    if (!h2) return;
    if (h2.querySelector('input')) return;
    var timer = null;
    var oldVal = h2.textContent.trim();
    timer = setTimeout(function() {
      var key = h2.getAttribute('data-section-key');
      var input = document.createElement('input');
      input.type = 'text'; input.value = oldVal;
      input.style.cssText = 'font-size:20px;font-weight:700;color:#0F1419;border:1px solid #6366F1;border-radius:8px;padding:2px 8px;width:100%;max-width:300px;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;font-family:inherit;letter-spacing:-.01em;';
      h2.textContent = ''; h2.appendChild(input);
      input.focus(); input.select();
      function save() {
        var newVal = input.value.trim();
        if (newVal && newVal !== oldVal) { customSecTitles[key] = newVal; }
        else { delete customSecTitles[key]; }
        _saveCustomData(CUSTOM_SEC_TITLES_KEY, customSecTitles)
        applySecTitles();
      }
      input.addEventListener('blur', save);
      input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') input.blur(); if (ev.key === 'Escape') { input.value = oldVal; input.blur(); } });
    }, 500);
    var onUp = function() { clearTimeout(timer); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mouseup', onUp);
  });

  /* ---- Hero title long-press edit ---- */
  var CUSTOM_HERO_TITLE_KEY = '_custom_hero_title';
  (function() {
    var raw = localStorage.getItem(CUSTOM_HERO_TITLE_KEY);
    if (raw) {
      var val = raw.trim();
      try { var parsed = JSON.parse(val); if (typeof parsed === 'string') val = parsed; } catch(e) {}
      if (val) {
        var dotIdx = val.indexOf('·');
        var heroHTML;
        if (dotIdx > -1) {
          heroHTML = val.slice(0, dotIdx).trim() + ' · <em>' + val.slice(dotIdx + 1).trim() + '</em>';
        } else {
          heroHTML = val;
        }
        document.querySelector('.hero h1').innerHTML = heroHTML;
        var navTitle = document.querySelector('.nav-title');
        if (navTitle) navTitle.innerHTML = heroHTML;
      }
    }
    var h1 = document.querySelector('.hero h1');
    if (!h1) return;
    var timer;
    h1.addEventListener('mousedown', function(e) {
      if (document.body.classList.contains('edit-locked')) return;
      if (h1.querySelector('input')) return;
      var oldHTML = h1.innerHTML;
      timer = setTimeout(function() {
        var input = document.createElement('input');
        input.type = 'text'; input.value = h1.textContent.trim();
        input.style.cssText = 'font-size:28px;font-weight:700;color:#0F1419;border:1px solid #6366F1;border-radius:8px;padding:2px 8px;width:100%;max-width:360px;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;font-family:inherit;text-align:center;';
        h1.textContent = ''; h1.appendChild(input);
        input.focus(); input.select();
        function save() {
          var newVal = input.value.trim();
          if (newVal) {
            localStorage.setItem(CUSTOM_HERO_TITLE_KEY, newVal);
            _saveCustomData(CUSTOM_HERO_TITLE_KEY, newVal);
            var dotIdx = newVal.indexOf('·');
            if (dotIdx > -1) {
              h1.innerHTML = newVal.slice(0, dotIdx).trim() + ' · <em>' + newVal.slice(dotIdx + 1).trim() + '</em>';
            } else {
              h1.textContent = newVal;
            }
            // 同步顶部导航
            var navTitle = document.querySelector('.nav-title');
            if (navTitle) navTitle.innerHTML = h1.innerHTML;
          } else {
            h1.innerHTML = oldHTML;
          }
        }
        input.addEventListener('blur', save);
        input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') input.blur(); if (ev.key === 'Escape') { input.value = h1.textContent.trim(); input.blur(); } });
      }, 500);
      var onUp = function() { clearTimeout(timer); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mouseup', onUp);
    });
  })();

  /* ---- Hero desc long-press edit ---- */
  var CUSTOM_HERO_DESC_KEY = '_custom_hero_desc';
  (function() {
    var raw = localStorage.getItem(CUSTOM_HERO_DESC_KEY);
    if (raw) { var val = raw.trim(); try { var parsed = JSON.parse(val); if (typeof parsed === 'string') val = parsed; } catch(e) {} if (val) document.querySelector('.hero-desc').textContent = val; }
    var desc = document.querySelector('.hero-desc');
    if (!desc) return;
    var timer;
    desc.addEventListener('mousedown', function(e) {
      if (document.body.classList.contains('edit-locked')) return;
      if (desc.querySelector('input, textarea')) return;
      var oldVal = desc.textContent.trim();
      timer = setTimeout(function() {
        var input = document.createElement('input');
        input.type = 'text'; input.value = oldVal;
        input.style.cssText = 'font-size:13px;color:#384b5a;border:1px solid #6366F1;border-radius:6px;padding:4px 8px;width:100%;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;font-family:inherit;text-align:center;letter-spacing:.08em;';
        desc.textContent = ''; desc.appendChild(input);
        input.focus(); input.select();
        function save() {
          var newVal = input.value.trim();
          if (newVal) {
            localStorage.setItem(CUSTOM_HERO_DESC_KEY, newVal);
            _saveCustomData(CUSTOM_HERO_DESC_KEY, newVal);
            desc.textContent = newVal;
          } else {
            desc.textContent = oldVal;
          }
        }
        input.addEventListener('blur', save);
        input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') input.blur(); if (ev.key === 'Escape') { input.value = oldVal; input.blur(); } });
      }, 500);
      var onUp = function() { clearTimeout(timer); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mouseup', onUp);
    });
  })();

  /* ---- Design Product Cards — long-press to edit category title / product name ---- */
  var CUSTOM_DESIGN_CATS_KEY = '_custom_design_cats';
  var CUSTOM_DESIGN_ITEMS_KEY = '_custom_design_items';
  var customDesignCats = {};
  var customDesignItems = {};
  try {
    var savedCats = localStorage.getItem(CUSTOM_DESIGN_CATS_KEY);
    if (savedCats) customDesignCats = JSON.parse(savedCats);
    var savedItems = localStorage.getItem(CUSTOM_DESIGN_ITEMS_KEY);
    if (savedItems) customDesignItems = JSON.parse(savedItems);
  } catch(e) {}

  function applyDesignCustoms() {
    document.querySelectorAll('#design .doc-card h4[data-design-cat]').forEach(function(h4) {
      var k = h4.getAttribute('data-design-cat');
      if (k && customDesignCats[k]) h4.textContent = customDesignCats[k];
    });
    document.querySelectorAll('#design .doc-card li[data-product]').forEach(function(li) {
      var k = li.getAttribute('data-product');
      if (k && customDesignItems[k]) li.textContent = customDesignItems[k];
    });
  }
  applyDesignCustoms();

  var _designPressTimer = null, _designPressTarget = null;

  document.getElementById('design').addEventListener('mousedown', function(e) {
    if (document.body.classList.contains('edit-locked')) return;
    var el = e.target.closest('.doc-card h4[data-design-cat], .doc-card li[data-product]');
    if (!el) return;
    _designPressTarget = el;
    _designPressTimer = setTimeout(function() {
      _designPressTimer = null;
      var card = el.closest('.doc-card');
      if (card) card._skipClick = true;
      startDesignEdit(el);
    }, 500);
  });

  document.addEventListener('mouseup', function() {
    if (_designPressTimer) { clearTimeout(_designPressTimer); _designPressTimer = null; _designPressTarget = null; }
  });

  function startDesignEdit(el) {
    if (el.querySelector('input')) return;
    var isH4 = el.matches('h4');
    var oldVal = el.textContent.trim();
    var key = isH4 ? el.getAttribute('data-design-cat') : el.getAttribute('data-product');

    var input = document.createElement('input');
    input.type = 'text'; input.value = oldVal;
    input.className = '_edit-input';
    input.style.cssText = isH4
      ? 'font-size:13px;font-weight:700;color:#2D4965;border:1px solid #6366F1;border-radius:6px;padding:2px 6px;width:100%;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;'
      : 'font-size:11.5px;color:var(--text2);border:1px solid #6366F1;border-radius:4px;padding:3px 6px;width:100%;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;';

    el.textContent = ''; el.appendChild(input);
    input.focus(); input.select();

    function save() {
      var newVal = input.value.trim();
      if (isH4) {
        if (newVal && newVal !== key) { customDesignCats[key] = newVal; }
        else { delete customDesignCats[key]; }
        _saveCustomData(CUSTOM_DESIGN_CATS_KEY, customDesignCats)
        el.textContent = newVal || key;
      } else {
        if (newVal && newVal !== oldVal) { customDesignItems[key] = newVal; }
        else { delete customDesignItems[key]; }
        _saveCustomData(CUSTOM_DESIGN_ITEMS_KEY, customDesignItems)
        el.textContent = newVal || oldVal;
      }
      _designPressTarget = null;
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { input.blur(); }
      if (ev.key === 'Escape') { input.value = oldVal; input.blur(); }
    });
  }

  /* ==============================
     Modal — Document Cards (visual + old)
     ============================== */
  document.querySelectorAll('#doc .doc-visual-card').forEach(function (card) {
    card.style.cursor = 'pointer';
    var _modalTimer = null;

    function _openModal() {
      var h4 = card.querySelector('h4');
      if (!h4) return;
      var dataKey = h4.getAttribute('data-doc-title');
      var dd = docData[dataKey];
      if (!dd) return;
      var displayTitle = h4.textContent.trim();

      var th = '<h3>' + displayTitle + '</h3>';
      th += '<p class="modal-desc" data-doc-desc-key="' + dataKey + '">' + dd.desc + '</p>';
      var results = []; var pending = 0;
      function render() {
        var bh = '<div class="design-gallery" style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px">';
        dd.items.forEach(function (it, i) {
          var dk = 'docimg_' + i + '_' + dataKey.replace(/\s/g, '_');
          var im = results[i] || [];
          var hu = im.length > 0;
          var savedItem2 = (customDocItems[dataKey] && customDocItems[dataKey][i]) ? customDocItems[dataKey][i] : null;
          var itemName = (savedItem2 && typeof savedItem2 === 'object') ? savedItem2.name : (savedItem2 || it.name);
          bh += '<div class="doc-file" style="cursor:pointer" onclick="event.stopPropagation();window._openDocLightbox(\x27' + dk + '\x27,\x27' + itemName.replace(/'/g,'&#39;') + '\x27)">';
          bh += '<div class="doc-file-preview">';
          var itemType = (savedItem2 && typeof savedItem2 === 'object' && savedItem2.type) ? (Array.isArray(savedItem2.type) ? savedItem2.type : [savedItem2.type]) : [];
          var iconSrc = it.icon || '';
          if (itemType.length) {
            var typeIcons = '';
            itemType.forEach(function(tt) {
              var ti = _getDocTypeIcon(tt);
              if (ti) typeIcons += '<span class="doc-file-icon" style="background-image:url(' + ti + ')"></span>';
            });
            if (typeIcons) { bh += '<span class="doc-file-icons">' + typeIcons + '</span>'; }
            else if (iconSrc) bh += '<span class="doc-file-icon" style="background-image:url(' + iconSrc + ')"></span>';
          } else if (iconSrc) {
            bh += '<span class="doc-file-icon" style="background-image:url(' + iconSrc + ')"></span>';
          }
          bh += '<span class="doc-file-name">' + itemName + '</span>';
          if (hu) { bh += '<span class="doc-file-badge">' + im.length + '</span>'; }
          bh += '<div class="doc-file-actions"><label class="doc-file-up" title="上传" onclick="event.stopPropagation()"><input type="file" accept="image/*,.pdf,.docx,.doc,.ppt,.pptx" multiple style="display:none" onchange="window._docUp(event,\x27' + dk + '\x27,\x27' + i + '\x27,\x27' + it.name.replace(/'/g, '&#39;') + '\x27)"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></label>';
          if (hu) bh += '<button class="doc-file-del" title="清除" onclick="event.stopPropagation();window._docDel(\x27' + dk + '\x27,\x27' + i + '\x27)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>';
          bh += '</div></div></div>';
        });
        bh += '</div>';
        
document.querySelector('.modal-box').classList.add('glass');
        document.getElementById('modalHeaderContent').innerHTML = th;
        document.getElementById('modal-body').innerHTML = bh;
        document.getElementById('modal').classList.add('on');
        document.getElementById('modal').scrollTop = 0;
        document.body.style.overflow = 'hidden';
      }
      dd.items.forEach(function (it, i) {
        var dk = 'docimg_' + i + '_' + dataKey.replace(/\s/g, '_');
        _docLoad(dk, function (imgs) {
          results[i] = imgs; pending++;
          if (pending >= dd.items.length) render();
        });
      });
    }

    card.addEventListener('click', function () {
      if (card._skipClick) { card._skipClick = false; return; }
      if (card.querySelector('input, textarea')) return;
      // 编辑中：关闭编辑，不弹窗
      var activeInput = card.querySelector('input._edit-input');
      if (activeInput) { activeInput.blur(); return; }
      _openModal();
    });
  });


  function close() { modal.classList.remove('on'); document.body.style.overflow = ''; var mb=document.querySelector('.modal-box');if(mb){mb.classList.remove('glass');mb.classList.remove('mgmt-modal');mb.classList.remove('prod-modal');} modalHeaderContent.innerHTML=''; modalBody.innerHTML=''; modalBody.style.overflow = ''; }
  modalX.addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  /* ==============================
     Hover Preview — inject preview div into product cards
     ============================== */
  var previewImages = {
    // 反电信网络诈骗
    gjfz: 'images/gjfz-preview.jpg',
    qmfz: 'images/qmfz-preview.jpg',
    sjgf: 'images/sjgf-preview.jpg',
    jingyin: 'images/jingyin-preview.jpg',
    // 区块链
    zsliam: 'images/zsliam-preview.jpg',
    guoban: 'images/guoban-preview.jpg',
    'zsl-browser': 'images/zsl-browser-preview.jpg',
    bitker: 'images/bitker-preview.jpg',
    // 互联网金融
    hudaiwang: 'images/hudaiwang-preview.jpg',
    gnxd: 'images/gnxd-preview.jpg',
    gwxd: 'images/gwxd-preview.jpg',
    // 金融支付
    quanzhanye: 'images/quanzhanye-preview.jpg',
    xinshengdai: 'images/xinshengdai-preview.jpg',
    weifenxiao: 'images/weifenxiao-preview.jpg',
    qianbaoxiaodai: 'images/qianbaoxiaodai-preview.jpg',
    // 社交电商
    panda: 'images/panda-preview.jpg',
    octopus: 'images/octopus-preview.jpg'
  };

  // inject hover preview divs into product category cards
  document.querySelectorAll('#design .doc-card').forEach(function (card) {
    // find first li with data-product to get preview image key
    var firstLi = card.querySelector('li[data-product]');
    if (!firstLi) return;
    var key = firstLi.dataset.product;
    var imgUrl = previewImages[key];
    if (!imgUrl) return;

    var preview = document.createElement('div');
    preview.className = 'hover-preview';
    preview.style.backgroundImage = 'url(' + imgUrl + ')';
    card.appendChild(preview);
  });

  /* ==============================
     Scroll reveal
     ============================== */
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: .12 });

  document.querySelectorAll('.card').forEach(function (c) {
    c.style.opacity = '0';
    c.style.transform = 'translateY(24px)';
    c.style.transition = 'opacity .6s cubic-bezier(0.22,1,0.36,1), transform .6s cubic-bezier(0.22,1,0.36,1)';
    obs.observe(c);
  });

  window._docImgs=window._docImgs||{};for(var di=0;di<localStorage.length;di++){var dk=localStorage.key(di);if(dk&&dk.indexOf('docimg_')===0){try{var raw=localStorage.getItem(dk);var parsed=JSON.parse(raw);if(Array.isArray(parsed)&&parsed.length===1&&parsed[0]==='__IDB__'){window._docImgs[dk]=[];continue;}window._docImgs[dk]=parsed;}catch(ee){}}}
  /* _docLoad: async load doc images — _docImgs cache first, localStorage, IndexedDB, timeout fallback */
  function _docLoad(k,cb){var done=false;function resolve(a){if(!done){done=true;cb(a);}}var cached=window._docImgs[k];if(cached&&cached.length)return resolve(cached);var r=localStorage.getItem(k);if(r){try{var a=JSON.parse(r);if(!(Array.isArray(a)&&a.length===1&&a[0]==='__IDB__')){if(a.length){window._docImgs[k]=a;return resolve(a);}}}catch(e){}}_prodDBLoad(k,function(db){var a=(db&&db.length)?db:[];if(a.length)window._docImgs[k]=a;resolve(a);});setTimeout(function(){resolve([]);},2000);}
  /* _refreshDocCard: unified DOM update for a single doc card (after upload/delete) */
  function _refreshDocCard(c,k,a,i){var hu=a&&a.length>0;c.style.cursor='pointer';c.onclick=function(ev){ev.stopPropagation();window._openDocLightbox(k,c.querySelector('.doc-file-name').textContent);};var pv=c.querySelector('.doc-file-preview');if(!pv)return;var bd=pv.querySelector('.doc-file-badge');if(hu){if(!bd){bd=document.createElement('span');bd.className='doc-file-badge';pv.appendChild(bd);}bd.textContent=a.length;bd.style.display='';}else{if(bd)bd.style.display='none';}var ac=pv.querySelector('.doc-file-actions');if(!ac)return;var db=ac.querySelector('.doc-file-del');if(hu&&!db){db=document.createElement('button');db.className='doc-file-del';db.title='清除';db.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';db.onclick=function(ev){ev.stopPropagation();window._docDel(k,i);};ac.appendChild(db);}if(!hu&&db){db.remove();}}
  /* _docUp: upload with canvas compression + progress ring + IndexedDB dual-write */
  window._docUp=function(e,k,i,nm){var f=e.target.files;if(!f.length)return;var a=window._docImgs[k]||[];var t=f.length;var dn=0;var ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center';var rg=document.createElement('div');rg.style.cssText='width:72px;height:72px;border-radius:50%;background:conic-gradient(#10B981 0%,transparent 0%);display:flex;align-items:center;justify-content:center';var inn=document.createElement('div');inn.style.cssText='width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--text)';inn.textContent='0%';rg.appendChild(inn);ov.appendChild(rg);document.body.appendChild(ov);function upd(p){inn.textContent=p+'%';rg.style.background='conic-gradient(#10B981 '+p*3.6+'deg,transparent 0deg)';}function finish(){window._docImgs[k]=a;try{var str=JSON.stringify(a);if(str.length<3000000){localStorage.setItem(k,str);}else{localStorage.setItem(k,'["__IDB__"]');}}catch(ee){try{localStorage.setItem(k,'["__IDB__"]');}catch(e2){}}_prodDBSave(k,a);for(var ci=Math.max(0,a.length-t);ci<a.length;ci++){_uploadToCloud(a[ci],'doc',k,'img_'+ci+'.jpg');}setTimeout(function(){ov.innerHTML='<div style="position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:10000;background:rgba(255,255,255,.55);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.4);border-radius:30px;padding:8px 18px;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.06),inset 0 1px 0 rgba(255,255,255,.6);font-size:12px;color:var(--text)"><span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#10B981;color:#fff;font-size:11px;flex-shrink:0">&#10003;</span><span>上传成功，共 <b>'+a.length+'</b> 张</span></div>';},100);setTimeout(function(){ov.remove();},2000);var cs=document.querySelectorAll('#modal-body .doc-file');var c=cs[parseInt(i)];if(c)_refreshDocCard(c,k,a,i);}for(var j=0;j<f.length;j++){(function(file){var img=new Image();img.onload=function(){var cvs=document.createElement('canvas');var mx=2400,w=img.width,h=img.height;if(w>mx){h=h*mx/w;w=mx;}cvs.width=w;cvs.height=h;cvs.getContext('2d').drawImage(img,0,0,w,h);cvs.toBlob(function(blob){var fr=new FileReader();fr.onload=function(ev){a.push(ev.target.result);dn++;upd(Math.round(dn/t*100));if(dn>=t)finish();};fr.readAsDataURL(blob);},'image/jpeg',0.85);};img.onerror=function(){dn++;if(dn>=t)finish();};img.src=URL.createObjectURL(file);})(f[j]);}};
  /* _docDel: delete from all stores + refresh DOM */
  window._docDel=function(k,i){delete window._docImgs[k];try{localStorage.removeItem(k);}catch(ee){}if(_prodDB){var t=_prodDB.transaction('imgs','readwrite');t.objectStore('imgs').delete(k);}_syncCloudUrlsAfterDelete(k);var cs=document.querySelectorAll('#modal-body .doc-file');var c=cs[parseInt(i)];if(c)_refreshDocCard(c,k,[],i);};

  /* ====== Doc Unified Preview ====== */
  window._openDocLightbox=function(k,itemName){
    var files=window._docImgs[k]||[];
    function render(filesArr){
      var lb=_buildDocLightbox(k,itemName,filesArr);
      document.body.appendChild(lb);
      function cleanup(){lb.remove();document.removeEventListener('keydown',onEsc);}
      var cb=lb.querySelector('#doc-lb-close-btn');if(cb)cb.onclick=cleanup;
      lb.addEventListener('click',function(e){var t=e.target;if(t.closest('.doc-lb-bar')||t.closest('.doc-lb-arrow')||t.closest('img')||t.closest('iframe')||t.closest('.doc-lb-dl-card')||t.closest('.doc-lb-pdf-wrap')||t.closest('.doc-lb-del-btn'))return;cleanup();});
      function onEsc(e){if(e.key==='Escape'){cleanup();}}
      document.addEventListener('keydown',onEsc);
    }
    if(files.length){render(files);return;}
    _docLoad(k,function(imgs){window._docImgs[k]=imgs||[];render(window._docImgs[k]);});
  };

  function _buildDocLightbox(k,itemName,files){
    var idx=0;
    var lb=document.createElement('div');lb.className='doc-lb-overlay';
    var bar=document.createElement('div');bar.className='doc-lb-bar';
    var barL=document.createElement('div');barL.className='doc-lb-bar-left';
    var nameSpan=document.createElement('span');nameSpan.className='doc-lb-name';nameSpan.textContent=itemName;
    var counterSpan=document.createElement('span');counterSpan.className='doc-lb-count';
    barL.appendChild(nameSpan);barL.appendChild(counterSpan);
    var barR=document.createElement('div');barR.style.cssText='display:flex;align-items:center;gap:8px';
    var delBtn=document.createElement('button');delBtn.className='doc-lb-del-btn';delBtn.title='删除当前文件';
    delBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
    barR.appendChild(delBtn);
    var cb2=document.createElement('button');cb2.id='doc-lb-close-btn';cb2.className='doc-lb-close';cb2.innerHTML='&times;';
    barR.appendChild(cb2);bar.appendChild(barL);bar.appendChild(barR);lb.appendChild(bar);
    var stage=document.createElement('div');stage.className='doc-lb-stage';lb.appendChild(stage);
    function mkArrow(left){var b=document.createElement('button');b.className='doc-lb-arrow '+(left?'doc-lb-prev':'doc-lb-next');b.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="'+(left?'15 18 9 12 15 6':'9 18 15 12 9 6')+'"/></svg>';return b;}
    var prevBtn=mkArrow(true);lb.appendChild(prevBtn);
    var nextBtn=mkArrow(false);lb.appendChild(nextBtn);
    var wm=document.createElement('div');wm.className='doc-lb-watermark';
    wm.innerHTML='<span>相关文件 仅供查看</span><span>相关文件 仅供查看</span><span>相关文件 仅供查看</span>';
    lb.appendChild(wm);
    function getCardIdx(){var parts=k.split('_');return parseInt(parts[1])||0;}
    function saveAndRefresh(nf){window._docImgs[k]=nf;try{var s=JSON.stringify(nf);if(s.length<3000000){localStorage.setItem(k,s);}else{localStorage.setItem(k,'["__IDB__"]');}}catch(ee){try{localStorage.setItem(k,'["__IDB__"]');}catch(e2){}}_prodDBSave(k,nf);var ci=getCardIdx();var ca=document.querySelectorAll('#modal-body .doc-file');var c=ca[ci];if(c)_refreshDocCard(c,k,nf,ci);}
    function delCur(fi){if(fi<0||fi>=files.length)return;files.splice(fi,1);saveAndRefresh(files);if(files.length===0){idx=0;updateUI();showFile(0);return;}if(idx>=files.length)idx=files.length-1;updateUI();showFile(idx);}
    function upDel(){if(files.length===0){delBtn.style.display='none';return;}delBtn.style.display=document.body.classList.contains('edit-locked')?'none':'flex';}
    function updateUI(){counterSpan.textContent=files.length>0?(idx+1)+' / '+files.length:'0 / 0';prevBtn.style.display=files.length>1?'flex':'none';nextBtn.style.display=files.length>1?'flex':'none';upDel();}
    function showFile(fi){idx=fi;updateUI();
      if(files.length===0){stage.innerHTML='<div class="doc-lb-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><p>暂无文件</p></div>';prevBtn.style.display='none';nextBtn.style.display='none';return;}
      var f=files[fi];var ft=(typeof f==='string')?'image':(f.type||'image');var fd=(typeof f==='string')?f:f.data;var fn=(typeof f==='string')?'':(f.name||'');
      stage.innerHTML='';
      if(ft==='image'){var img=document.createElement('img');img.src=fd;img.className='doc-lb-img';stage.appendChild(img);}
      else if(ft==='pdf'){var bu=fd;try{var p=fd.split(',');if(p.length===2){var r2=atob(p[1]);var by=new Uint8Array(r2.length);for(var bi=0;bi<r2.length;bi++)by[bi]=r2.charCodeAt(bi);bu=URL.createObjectURL(new Blob([by],{type:'application/pdf'}));}}catch(ee2){}var iwp=/word|doc|文档|docx/i.test(fn)&&!/ppt|演示|presentation/i.test(fn);stage.innerHTML='<div class="doc-lb-pdf-wrap'+(iwp?' doc-lb-pdf-word':'')+'"><iframe src="'+bu+'#toolbar=0&navpanes=0&scrollbar=0" scrolling="no"></iframe></div>';}
      else{var im={word:'images/doc-type-word.png',ppt:'images/doc-type-ppt.png'};var lm={word:'Word 文档',ppt:'PPT 文档'};stage.innerHTML='<div class="doc-lb-dl-card"><img src="'+im[ft]+'" class="doc-lb-dl-icon"><h3>'+(fn||lm[ft])+'</h3><p>此格式暂不支持在线预览</p><a href="'+fd+'" download="'+fn+'" class="doc-lb-dl-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>下载文件</a></div>';}
    }
    showFile(0);
    delBtn.addEventListener('click',function(e){e.stopPropagation();delCur(idx);});
    prevBtn.onclick=function(e){e.stopPropagation();if(files.length>1)showFile(idx>0?idx-1:files.length-1);};
    nextBtn.onclick=function(e){e.stopPropagation();if(files.length>1)showFile(idx<files.length-1?idx+1:0);};
    lb.addEventListener('contextmenu',function(e){e.preventDefault();return false;});
    lb.addEventListener('keydown',function(e){if(e.ctrlKey&&(e.key==='c'||e.key=='C')){e.preventDefault();}if(e.key==='ArrowLeft'&&files.length>1)showFile(idx>0?idx-1:files.length-1);if(e.key==='ArrowRight'&&files.length>1)showFile(idx<files.length-1?idx+1:0);if(e.key==='Delete'&&!document.body.classList.contains('edit-locked'))delCur(idx);});
    return lb;
  };

  var _prodDB=null,_prodQueue=[];
  (function(){var r=indexedDB.open('ProdImagesDB',1);r.onupgradeneeded=function(e){e.target.result.createObjectStore('imgs');};r.onsuccess=function(e){_prodDB=e.target.result;for(var i=0;i<_prodQueue.length;i++){_prodQueue[i]();}_prodQueue=[];if(!localStorage.getItem('_db_cleanup_v1')){try{var t=_prodDB.transaction('imgs','readwrite');var s=t.objectStore('imgs');var delKeys=['sln_file_arch','sln_file_summary','sln_file_xinsheng','sln_img_arch','sln_img_summary','sln_img_xinsheng'];for(var j=0;j<delKeys.length;j++){s.delete(delKeys[j]);}localStorage.setItem('_db_cleanup_v1','1');}catch(ee){}}};r.onerror=function(){_prodDB=null;};})();
  function _prodDBSave(k,a){if(_prodDB){var t=_prodDB.transaction('imgs','readwrite');t.objectStore('imgs').put(a,k);}else{_prodQueue.push(function(){_prodDBSave(k,a);});}}
  function _prodDBLoad(k,cb){if(_prodDB){var t=_prodDB.transaction('imgs','readonly');var r=t.objectStore('imgs').get(k);r.onsuccess=function(){cb(r.result||[]);};r.onerror=function(){cb([]);};}else{_prodQueue.push(function(){_prodDBLoad(k,cb);});}}
  window._prodGetImgs=function(k,cb){if(cb){_prodDBLoad(k,cb);return;}var r=sessionStorage.getItem(k);if(!r){r=localStorage.getItem(k);}if(!r)return[];try{var a=JSON.parse(r);if(Array.isArray(a)&&!(a.length===1&&a[0]==='__IDB__'))return a;}catch(ee){}return[];};
  window._prodRebuild=function(k,a,save){if(save!==false){try{sessionStorage.setItem(k,JSON.stringify(a));}catch(ee){}try{localStorage.setItem(k,JSON.stringify(a));}catch(ee){}_prodDBSave(k,a);}var s=k.replace('prod_imgs_','');var d=document.getElementById('prod-scroll-'+s);if(!d){var s2=k.replace('sln_img_','');if(s2!==k){d=document.getElementById('sln-scroll-'+s2);}if(!d)return;}if(!a||!a.length){d.style.display='none';d.innerHTML='';return;}d.style.display='flex';var h='';for(var i=0;i<a.length;i++)h+='<div style="position:relative;flex-shrink:0" onmouseenter="var b=this.querySelector(\x27.dg-del-btn\x27);if(b)b.style.opacity=\x271\x27" onmouseleave="var b=this.querySelector(\x27.dg-del-btn\x27);if(b)b.style.opacity=\x270\x27"><img src="'+a[i]+'" style="width:200px;height:130px;object-fit:contain;border-radius:10px;cursor:pointer;background:rgba(0,0,0,.02)" onclick="event.stopPropagation();openLightbox(this.src,'+JSON.stringify(a).replace(/"/g,'&quot;')+')"><button class="dg-del-btn" style="position:absolute;top:4px;right:4px;opacity:0;transition:opacity .2s" onclick="event.stopPropagation();window._prodDelImg(\x27'+k+'\x27,'+i+')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button></div>';d.innerHTML=h;};
  window._prodUpload=function(e,k){var f=e.target.files;if(!f.length)return;_prodDBLoad(k,function(ex){var a=(ex&&ex.length)?ex:[];var t=f.length;var dn=0;var ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center';var rg=document.createElement('div');rg.style.cssText='width:72px;height:72px;border-radius:50%;background:conic-gradient(#10B981 0%,transparent 0%);display:flex;align-items:center;justify-content:center';var inn=document.createElement('div');inn.style.cssText='width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--text)';inn.textContent='0%';rg.appendChild(inn);ov.appendChild(rg);document.body.appendChild(ov);var rds=[];for(var i=0;i<f.length;i++){rds[i]=new FileReader();rds[i].onload=function(ev){a.push(ev.target.result);dn++;var p=Math.round(dn/t*100);inn.textContent=p+'%';rg.style.background='conic-gradient(#10B981 '+p*3.6+'deg,transparent 0deg)';window._prodRebuild(k,a,false);if(dn>=t){try{sessionStorage.setItem(k,JSON.stringify(a));}catch(ee){}window._prodRebuild(k,a);for(var ci=Math.max(0,a.length-t);ci<a.length;ci++){_uploadToCloud(a[ci],'prod',k,'img_'+ci+'.jpg');}setTimeout(function(){ov.innerHTML='<div style="position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:10000;background:rgba(255,255,255,.55);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.4);border-radius:30px;padding:8px 18px;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.06),inset 0 1px 0 rgba(255,255,255,.6);font-size:12px;color:var(--text)"><span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#10B981;color:#fff;font-size:11px;flex-shrink:0">&#10003;</span><span>上传成功，共 <b>'+a.length+'</b> 张</span></div>';},100);setTimeout(function(){ov.remove();},2000);}};rds[i].onerror=function(){dn++;if(dn>=t){ov.remove();}};rds[i].readAsDataURL(f[i]);}});};
  window._prodDelImg=function(k,i){_prodDBLoad(k,function(db){var a=(db&&db.length)?db:window._prodGetImgs(k);i=parseInt(i);if(isNaN(i)||i<0||i>=a.length)return;a.splice(i,1);window._prodRebuild(k,a);try{sessionStorage.setItem(k,JSON.stringify(a));}catch(ee){}if(_prodDB){var t=_prodDB.transaction('imgs','readwrite');if(a.length>0){t.objectStore('imgs').put(a,k);}else{t.objectStore('imgs').delete(k);}}_syncCloudUrlsAfterDelete(k);});};
  /* Solution file helpers */
  function _slnLoad(k,cb){var done=false;function resolve(a){if(!done){done=true;cb(a);}}_prodDBLoad(k,function(db){if(db&&db.length){resolve(db);return;}var r=sessionStorage.getItem(k)||localStorage.getItem(k);var a=[];if(r){try{a=JSON.parse(r);}catch(ee){a=[];}}resolve(a);});setTimeout(function(){resolve([]);},2000);}
  window._slnUpload=function(e,k){var f=e.target.files;if(!f.length)return;_slnLoad(k,function(ex){var a=ex||[];var t=f.length;var dn=0;var ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center';var rg=document.createElement('div');rg.style.cssText='width:72px;height:72px;border-radius:50%;background:conic-gradient(#10B981 0%,transparent 0%);display:flex;align-items:center;justify-content:center';var inn=document.createElement('div');inn.style.cssText='width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--text)';inn.textContent='0%';rg.appendChild(inn);ov.appendChild(rg);document.body.appendChild(ov);function upd(p){inn.textContent=p+'%';rg.style.background='conic-gradient(#10B981 '+p*3.6+'deg,transparent 0deg)';}function finish(){try{sessionStorage.setItem(k,JSON.stringify(a));}catch(ee){}_prodDBSave(k,a);for(var ci=Math.max(0,a.length-t);ci<a.length;ci++){var item=a[ci];if(item&&item.type==='image'){_uploadToCloud(item.data,'sln',k,item.name||'image.jpg');}}setTimeout(function(){ov.innerHTML='<div style="position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:10000;background:rgba(255,255,255,.55);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.4);border-radius:30px;padding:8px 18px;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.06),inset 0 1px 0 rgba(255,255,255,.6);font-size:12px;color:var(--text)"><span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#10B981;color:#fff;font-size:11px;flex-shrink:0">&#10003;</span><span>上传成功，共 <b>'+a.length+'</b> 个文件</span></div>';},100);setTimeout(function(){ov.remove();},2000);window._slnFileRebuild(k,a);}for(var j=0;j<f.length;j++){(function(file){var isPdf=file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf');var isWord=!isPdf&&(file.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'||file.name.toLowerCase().endsWith('.docx')||file.name.toLowerCase().endsWith('.doc'));var isPpt=!isPdf&&!isWord&&(file.type==='application/vnd.openxmlformats-officedocument.presentationml.presentation'||file.name.toLowerCase().endsWith('.pptx')||file.name.toLowerCase().endsWith('.ppt'));if(isPdf){var fr=new FileReader();fr.onload=function(ev){a.push({type:'pdf',data:ev.target.result,name:file.name});dn++;upd(Math.round(dn/t*100));if(dn>=t)finish();};fr.readAsDataURL(file);}else if(isWord){var fr2=new FileReader();fr2.onload=function(ev){a.push({type:'word',data:ev.target.result,name:file.name});dn++;upd(Math.round(dn/t*100));if(dn>=t)finish();};fr2.readAsDataURL(file);}else if(isPpt){var fr3=new FileReader();fr3.onload=function(ev){a.push({type:'ppt',data:ev.target.result,name:file.name});dn++;upd(Math.round(dn/t*100));if(dn>=t)finish();};fr3.readAsDataURL(file);}else{var img=new Image();img.onload=function(){var cvs=document.createElement('canvas');var mx=2400,w=img.width,h=img.height;if(w>mx){h=h*mx/w;w=mx;}cvs.width=w;cvs.height=h;cvs.getContext('2d').drawImage(img,0,0,w,h);cvs.toBlob(function(blob){var fr=new FileReader();fr.onload=function(ev){a.push({type:'image',data:ev.target.result});dn++;upd(Math.round(dn/t*100));if(dn>=t)finish();};fr.readAsDataURL(blob);},'image/jpeg',0.85);};img.onerror=function(){dn++;if(dn>=t)finish();};img.src=URL.createObjectURL(file);}})(f[j]);}});};
  window._slnFileDel=function(k,i){_slnLoad(k,function(a){i=parseInt(i);if(isNaN(i)||i<0||i>=a.length)return;a.splice(i,1);window._slnFileRebuild(k,a);if(_prodDB){var t=_prodDB.transaction('imgs','readwrite');if(a.length>0){t.objectStore('imgs').put(a,k);}else{t.objectStore('imgs').delete(k);}}_syncCloudUrlsAfterDelete(k);});};
  window._slnFileRebuild=function(k,a,save){if(save!==false){try{sessionStorage.setItem(k,JSON.stringify(a));}catch(ee){}try{localStorage.setItem(k,JSON.stringify(a));}catch(ee){}_prodDBSave(k,a);}var s=k.replace('sln_file_','');var d=document.getElementById('sln-scroll-'+s);if(!d)return;if(!a||!a.length){d.style.display='none';d.innerHTML='';return;}d.style.display='flex';var h='';for(var i=0;i<a.length;i++){var f=a[i];var isPdf=f&&f.type==='pdf';var isWord=f&&f.type==='word';var isPpt=f&&f.type==='ppt';var data=f&&f.data?f.data:f;var name=f&&f.name?f.name:'';if(isPdf||isWord||isPpt){var iconSrc2=isPdf?'images/doc-type-pdf.png':isWord?'images/doc-type-word.png':'images/doc-type-ppt.png';var label2=isPdf?(name||'PDF 文件'):isWord?(name||'Word 文件'):(name||'PPT 文件');h+='<div style="position:relative;flex-shrink:0" onmouseenter="var b=this.querySelector(\x27.dg-del-btn\x27);if(b)b.style.opacity=\x271\x27" onmouseleave="var b=this.querySelector(\x27.dg-del-btn\x27);if(b)b.style.opacity=\x270\x27"><div onclick="event.stopPropagation();window._openSlnPreview(\x27'+k+'\x27,'+i+')" style="width:160px;height:130px;border-radius:10px;cursor:pointer;background:linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,.5)),url(images/sln-cover-bg.png) center/cover no-repeat;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.5);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;transition:all .25s ease" onmouseenter="this.style.transform=\x27translateY(-5px)\x27" onmouseleave="this.style.transform=\x27translateY(0)\x27"><img src="'+iconSrc2+'" style="width:36px;height:36px;object-fit:contain" alt=""><span style="font-size:10px;color:var(--text2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+label2+'</span></div><button class="dg-del-btn" style="position:absolute;top:4px;right:4px;opacity:0;transition:opacity .2s" onclick="event.stopPropagation();window._slnFileDel(\x27'+k+'\x27,'+i+')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button></div>';}else{h+='<div style="position:relative;flex-shrink:0" onmouseenter="var b=this.querySelector(\x27.dg-del-btn\x27);if(b)b.style.opacity=\x271\x27" onmouseleave="var b=this.querySelector(\x27.dg-del-btn\x27);if(b)b.style.opacity=\x270\x27"><img src="'+data+'" style="width:200px;height:130px;object-fit:contain;border-radius:10px;cursor:pointer;background:rgba(0,0,0,.02)" onclick="event.stopPropagation();window._openSlnPreview(\x27'+k+'\x27,'+i+')"><button class="dg-del-btn" style="position:absolute;top:4px;right:4px;opacity:0;transition:opacity .2s" onclick="event.stopPropagation();window._slnFileDel(\x27'+k+'\x27,'+i+')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button></div>';}}d.innerHTML=h;};
  /* ---- 方案设计统一预览 --- */
  window._openSlnPreview=function(k,startIdx){_slnLoad(k,function(files){if(!files||!files.length)return;var lb=_buildSlnLightbox(k,files,startIdx||0);document.body.appendChild(lb);function cleanup(){lb.remove();document.removeEventListener('keydown',onEsc);}var cb=lb.querySelector('#doc-lb-close-btn');if(cb)cb.onclick=cleanup;lb.addEventListener('click',function(e){var t=e.target;if(t.closest('.doc-lb-bar')||t.closest('.doc-lb-arrow')||t.closest('img')||t.closest('iframe')||t.closest('.doc-lb-dl-card')||t.closest('.doc-lb-pdf-wrap')||t.closest('.doc-lb-del-btn'))return;cleanup();});function onEsc(e){if(e.key==='Escape'){cleanup();}}document.addEventListener('keydown',onEsc);});};

  function _buildSlnLightbox(k,files,startIdx){
    var idx=startIdx||0;
    var lb=document.createElement('div');lb.className='doc-lb-overlay';
    var bar=document.createElement('div');bar.className='doc-lb-bar';
    var barL=document.createElement('div');barL.className='doc-lb-bar-left';
    var nameSpan2=document.createElement('span');nameSpan2.className='doc-lb-name';nameSpan2.textContent='方案展示';
    var counterSpan2=document.createElement('span');counterSpan2.className='doc-lb-count';
    barL.appendChild(nameSpan2);barL.appendChild(counterSpan2);
    var barR=document.createElement('div');barR.style.cssText='display:flex;align-items:center;gap:8px';
    var delBtn=document.createElement('button');delBtn.className='doc-lb-del-btn';delBtn.title='删除当前文件';
    delBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
    barR.appendChild(delBtn);
    var cb=document.createElement('button');cb.id='doc-lb-close-btn';cb.className='doc-lb-close';cb.innerHTML='&times;';
    barR.appendChild(cb);bar.appendChild(barL);bar.appendChild(barR);lb.appendChild(bar);
    var stage2=document.createElement('div');stage2.className='doc-lb-stage';lb.appendChild(stage2);
    function mkArrow(left){var b=document.createElement('button');b.className='doc-lb-arrow '+(left?'doc-lb-prev':'doc-lb-next');b.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="'+(left?'15 18 9 12 15 6':'9 18 15 12 9 6')+'"/></svg>';return b;}
    var prevBtn=mkArrow(true);lb.appendChild(prevBtn);var nextBtn=mkArrow(false);lb.appendChild(nextBtn);
    var wm=document.createElement('div');wm.className='doc-lb-watermark';
    wm.innerHTML='<span>相关文件 仅供查看</span><span>相关文件 仅供查看</span><span>相关文件 仅供查看</span>';
    lb.appendChild(wm);
    function saveAndRefresh(nf){try{sessionStorage.setItem(k,JSON.stringify(nf));}catch(ee){}_prodDBSave(k,nf);window._slnFileRebuild(k,nf);}
    function delCur(fi){if(fi<0||fi>=files.length)return;files.splice(fi,1);saveAndRefresh(files);if(files.length===0){idx=0;updateUI2();showFile2(0);return;}if(idx>=files.length)idx=files.length-1;updateUI2();showFile2(idx);}
    function upDel2(){if(files.length===0){delBtn.style.display='none';return;}delBtn.style.display=document.body.classList.contains('edit-locked')?'none':'flex';}
    function updateUI2(){counterSpan2.textContent=files.length>0?(idx+1)+' / '+files.length:'0 / 0';prevBtn.style.display=files.length>1?'flex':'none';nextBtn.style.display=files.length>1?'flex':'none';upDel2();}
    function showFile2(fi){idx=fi;updateUI2();
      if(files.length===0){stage2.innerHTML='<div class="doc-lb-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity=".2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><p>暂无文件</p></div>';prevBtn.style.display='none';nextBtn.style.display='none';return;}
      var f=files[fi];var ft=(typeof f==='string')?'image':(f.type||'image');var fd=(typeof f==='string')?f:f.data;var fn=(typeof f==='string')?'':(f.name||'');
      stage2.innerHTML='';
      if(ft==='image'){var img=document.createElement('img');img.src=fd;img.className='doc-lb-img';stage2.appendChild(img);}
      else if(ft==='pdf'){var bu=fd;try{var p=fd.split(',');if(p.length===2){var r2=atob(p[1]);var by=new Uint8Array(r2.length);for(var bi=0;bi<r2.length;bi++)by[bi]=r2.charCodeAt(bi);bu=URL.createObjectURL(new Blob([by],{type:'application/pdf'}));}}catch(ee2){}var iwp=/word|doc|文档|docx/i.test(fn)&&!/ppt|演示|presentation/i.test(fn);stage2.innerHTML='<div class="doc-lb-pdf-wrap'+(iwp?' doc-lb-pdf-word':'')+'"><iframe src="'+bu+'#toolbar=0&navpanes=0&scrollbar=0" scrolling="no"></iframe></div>';}
      else{var im={word:'images/doc-type-word.png',ppt:'images/doc-type-ppt.png'};var lm={word:'Word 文档',ppt:'PPT 文档'};stage2.innerHTML='<div class="doc-lb-dl-card"><img src="'+im[ft]+'" class="doc-lb-dl-icon"><h3>'+(fn||lm[ft])+'</h3><p>此格式暂不支持在线预览</p><a href="'+fd+'" download="'+fn+'" class="doc-lb-dl-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>下载文件</a></div>';}
    }
    showFile2(startIdx||0);
    delBtn.addEventListener('click',function(e){e.stopPropagation();delCur(idx);});
    prevBtn.onclick=function(e){e.stopPropagation();if(files.length>1)showFile2(idx>0?idx-1:files.length-1);};
    nextBtn.onclick=function(e){e.stopPropagation();if(files.length>1)showFile2(idx<files.length-1?idx+1:0);};
    lb.addEventListener('contextmenu',function(e){e.preventDefault();return false;});
    lb.addEventListener('keydown',function(e){if(e.ctrlKey&&(e.key==='c'||e.key=='C')){e.preventDefault();}if(e.key==='ArrowLeft'&&files.length>1)showFile2(idx>0?idx-1:files.length-1);if(e.key==='ArrowRight'&&files.length>1)showFile2(idx<files.length-1?idx+1:0);if(e.key==='Delete'&&!document.body.classList.contains('edit-locked'))delCur(idx);});
    return lb;
  }

  /* PDF preview — custom PDF.js viewer with clean scrollbars */
  /* PDF preview — browser native via Blob URL iframe (fast, clear, correct layout) */
  window._slnPreviewPdf=function(k,idx){_slnLoad(k,function(a){var f=a[parseInt(idx)];if(!f||f.type!=='pdf')return;var data=f.data;var name=f.name||'PDF 文件';
    var blobUrl=data;
    try{
      var parts=data.split(',');
      if(parts.length===2){
        var mime=parts[0].split(':')[1].split(';')[0];
        var raw=atob(parts[1]);
        var bytes=new Uint8Array(raw.length);
        for(var bi=0;bi<raw.length;bi++)bytes[bi]=raw.charCodeAt(bi);
        blobUrl=URL.createObjectURL(new Blob([bytes],{type:mime}));
      }
    }catch(ee){}
    var lb=document.createElement('div');lb.className='pdf-lightbox';
    lb.innerHTML='<div class="pdf-lb-header"><img src="images/doc-type-pdf.png" style="width:22px;height:22px;object-fit:contain;flex-shrink:0" alt=""><span class="pdf-lb-name">'+name+'</span><button class="pdf-lb-close" onclick="this.closest(\x27.pdf-lightbox\x27).remove();document.body.style.overflow=\x27\x27">&times;</button></div><div class="pdf-lb-viewer"><iframe src="'+blobUrl+'#toolbar=0&navpanes=0" oncontextmenu="return false" onselectstart="return false"></iframe><div class="pdf-lb-overlay"></div><div class="pdf-lb-watermark"><span>相关文件  仅供查看</span><span>相关文件  仅供查看</span><span>相关文件  仅供查看</span></div></div>';
    lb.addEventListener('click',function(e){if(e.target===lb){lb.remove();document.body.style.overflow='';}});
    lb.addEventListener('contextmenu',function(e){e.preventDefault();return false;});
    lb.addEventListener('selectstart',function(e){e.preventDefault();return false;});
    lb.addEventListener('keydown',function(e){if(e.ctrlKey&&(e.key==='c'||e.key==='C'||e.key==='a'||e.key==='A'||e.key==='x'||e.key==='X')){e.preventDefault();return false;}});
    document.body.appendChild(lb);document.body.style.overflow='hidden';
    var viewer=lb.querySelector('.pdf-lb-viewer');
    var isDown=false,startX,startY,scrollX,scrollY;
    viewer.addEventListener('mousedown',function(e){isDown=true;startX=e.pageX;startY=e.pageY;scrollX=viewer.scrollLeft;scrollY=viewer.scrollTop;e.preventDefault();});
    viewer.addEventListener('mousemove',function(e){if(!isDown)return;viewer.scrollLeft=scrollX-(e.pageX-startX);viewer.scrollTop=scrollY-(e.pageY-startY);});
    viewer.addEventListener('mouseup',function(){isDown=false;});
    viewer.addEventListener('mouseleave',function(){isDown=false;});
    var wm=lb.querySelector('.pdf-lb-watermark');if(wm){wm.addEventListener('contextmenu',function(e){e.preventDefault();return false;});wm.addEventListener('selectstart',function(e){e.preventDefault();return false;});}
    function onEsc(e){if(e.key==='Escape'){lb.remove();document.body.style.overflow='';document.removeEventListener('keydown',onEsc);}}
    document.addEventListener('keydown',onEsc);
  });};
  /* PPT/Word preview — show download card (browsers cannot render Office docs inline) */
  window._slnPreviewPpt=function(k,idx){_slnLoad(k,function(a){var f=a[parseInt(idx)];if(!f||f.type!=='ppt')return;var data=f.data;var name=f.name||'PPT 文件';_showOfficePreview('images/doc-type-ppt.png',name,data);});};
  window._slnPreviewWord=function(k,idx){_slnLoad(k,function(a){var f=a[parseInt(idx)];if(!f||f.type!=='word')return;var data=f.data;var name=f.name||'Word 文件';_showOfficePreview('images/doc-type-word.png',name,data);});};
  function _showOfficePreview(iconSrc,name,data){
    var lb=document.createElement('div');lb.className='pdf-lightbox';
    lb.innerHTML='<div class="pdf-lb-header"><img src="'+iconSrc+'" style="width:22px;height:22px;object-fit:contain;flex-shrink:0" alt=""><span class="pdf-lb-name">'+name+'</span><button class="pdf-lb-close" onclick="this.closest(\x27.pdf-lightbox\x27).remove();document.body.style.overflow=\x27\x27">&times;</button></div><div class="pdf-lb-viewer" style="display:flex;align-items:center;justify-content:center;background:rgba(248,250,252,.95)"><div style="text-align:center;padding:40px"><img src="'+iconSrc+'" style="width:64px;height:64px;object-fit:contain;margin-bottom:16px;opacity:.7" alt=""><h3 style="font-size:16px;font-weight:600;color:var(--text);margin:0 0 4px 0">'+name+'</h3><p style="font-size:12px;color:var(--text2);margin:0 0 20px 0">此格式暂不支持在线预览</p><button id="office-dl-btn" style="display:inline-flex;align-items:center;gap:6px;padding:10px 24px;border-radius:10px;border:1px solid rgba(99,102,241,.3);background:rgba(99,102,241,.06);color:#6366F1;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit" onclick="event.stopPropagation()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>下载文件</button></div><div class="pdf-lb-overlay"></div><div class="pdf-lb-watermark"><span>相关文件  仅供查看</span><span>相关文件  仅供查看</span><span>相关文件  仅供查看</span></div></div>';
    lb.addEventListener('click',function(e){if(e.target===lb){lb.remove();document.body.style.overflow='';}});
    lb.addEventListener('contextmenu',function(e){e.preventDefault();return false;});
    document.body.appendChild(lb);document.body.style.overflow='hidden';
    setTimeout(function(){
      var btn=lb.querySelector('#office-dl-btn');if(btn)btn.onclick=function(ev){ev.stopPropagation();var a=document.createElement('a');a.href=data;a.download=name;a.click();};
    },50);
    function onEsc(e){if(e.key==='Escape'){lb.remove();document.body.style.overflow='';document.removeEventListener('keydown',onEsc);}}
    document.addEventListener('keydown',onEsc);
  }

  var _di=[{p:'百威 ABI',t:'Mobile / TV',im:['images/budweiser-logo.png']},{p:'永辉超市',t:'PC',im:['images/yonghui-logo.png']},{p:'达能水业',t:'Mobile',im:['images/danone-logo.png']},{p:'日本罗森',t:'PC',im:['images/lawson-logo.png']}];
  // Load design images: localStorage first (instant), IndexedDB with timeout fallback
  function _designLoad(k,cb){var done=false;function resolve(a){if(!done){done=true;cb(a);}}var r=localStorage.getItem(k);if(r){try{var a=JSON.parse(r);if(a.length)return resolve(a);}catch(e){}}_prodDBLoad(k,function(db){resolve((db&&db.length)?db:[]);});setTimeout(function(){resolve([]);},1200);}
  // Design image upload — canvas compression + progress ring + IndexedDB
  window._du=function(e,idx){var f=e.target.files;if(!f.length)return;var k='design_img_'+idx;
    var ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.15);display:flex;align-items:center;justify-content:center';
    var rg=document.createElement('div');rg.style.cssText='width:72px;height:72px;border-radius:50%;background:conic-gradient(#10B981 0%,transparent 0%);display:flex;align-items:center;justify-content:center';
    var inn=document.createElement('div');inn.style.cssText='width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.5);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--text)';inn.textContent='0%';
    rg.appendChild(inn);ov.appendChild(rg);document.body.appendChild(ov);
    function upd(p){inn.textContent=p+'%';rg.style.background='conic-gradient(#10B981 '+p*3.6+'deg,transparent 0deg)';}
    _designLoad(k,function(a){var t=f.length;var dn=0;
      function finish(){localStorage.setItem(k,JSON.stringify(a));_prodDBSave(k,a);
        for(var ci=Math.max(0,a.length-t);ci<a.length;ci++){_uploadToCloud(a[ci],'design',k,'img_'+ci+'.jpg');}
        setTimeout(function(){ov.innerHTML='<div style="position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:10000;background:rgba(255,255,255,.55);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.4);border-radius:30px;padding:8px 18px;display:flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,.06),inset 0 1px 0 rgba(255,255,255,.6);font-size:12px;color:var(--text)"><span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#10B981;color:#fff;font-size:11px;flex-shrink:0">&#10003;</span><span>上传成功，共 <b>'+a.length+'</b> 张</span></div>';},100);
        setTimeout(function(){ov.remove();},2000);
        var c=document.querySelectorAll('.design-gallery-item')[idx];if(c)_refreshDesignCard(c,idx,k,a);
      }
      for(var i=0;i<f.length;i++){(function(file){
        var img=new Image();img.onload=function(){var cvs=document.createElement('canvas');var mx=2400,w=img.width,h=img.height;if(w>mx){h=h*mx/w;w=mx;}cvs.width=w;cvs.height=h;cvs.getContext('2d').drawImage(img,0,0,w,h);cvs.toBlob(function(blob){var fr=new FileReader();fr.onload=function(ev){a.push(ev.target.result);dn++;upd(Math.round(dn/t*100));if(dn>=t)finish();};fr.readAsDataURL(blob);},'image/jpeg',0.85);};
        img.onerror=function(){dn++;if(dn>=t)finish();};img.src=URL.createObjectURL(file);
      })(f[i]);}
    });
  };
  // Refresh a single design card after upload/delete
  function _refreshDesignCard(c,idx,k,a){var hu=a&&a.length>0;
    if(hu){c.style.cursor='pointer';c.onclick=function(ev){ev.stopPropagation();var im=window._designGetImgs(k);if(im.length)openLightbox(im[0],im,k,idx);};}
    else{c.onclick=null;c.style.cursor='default';}
    var bd=c.querySelector('.design-badge');
    if(hu){if(!bd){bd=document.createElement('span');bd.className='design-badge';bd.style.cssText='position:absolute;bottom:8px;left:50%;transform:translateX(-50%);z-index:5;background:rgba(0,0,0,.25);color:#fff;font-size:10px;padding:2px 8px;border-radius:12px;pointer-events:none';c.querySelector('.dg-img-wrap').appendChild(bd);}bd.textContent=a.length+'张';bd.style.display='';}
    else{if(bd)bd.style.display='none';}
    var ac=c.querySelector('.dg-actions');if(!ac)return;
    if(hu&&!ac.querySelector('.dg-del-btn')){var b=document.createElement('button');b.className='dg-act-btn dg-del-btn';b.title='清除';b.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';b.onclick=function(ev){ev.stopPropagation();window._dd(idx);};ac.appendChild(b);}
    if(!hu){var db=ac.querySelector('.dg-del-btn');if(db)db.remove();}
  }
  // Sync localStorage getter for design images (lightbox ref)
  window._designGetImgs=function(k){var r=localStorage.getItem(k);return r?JSON.parse(r):[];};
  // Design image delete — IndexedDB + localStorage + DOM
  window._dd=function(idx){var k='design_img_'+idx;localStorage.removeItem(k);if(_prodDB){var t=_prodDB.transaction('imgs','readwrite');t.objectStore('imgs').delete(k);}_syncCloudUrlsAfterDelete(k);var c=document.querySelectorAll('.design-gallery-item')[idx];if(c)_refreshDesignCard(c,idx,k,[]);};
  /* ---- Product Modal: long-press to edit description & metrics ---- */
  var _prodPressTimer = null, _prodPressTarget = null;

  document.getElementById('modal-body').addEventListener('mousedown', function(e) {
    if (document.body.classList.contains('edit-locked')) return;
    /* Description */
    var descEl = e.target.closest('.prod-desc-text');
    if (descEl) {
      _prodPressTarget = descEl;
      _prodPressTimer = setTimeout(function() { _prodPressTimer = null; _startProdDescEdit(descEl); }, 500);
      return;
    }
    /* Metric tag */
    var tagEl = e.target.closest('.prod-metric-tag');
    if (tagEl) {
      _prodPressTarget = tagEl;
      _prodPressTimer = setTimeout(function() { _prodPressTimer = null; _startProdTagEdit(tagEl); }, 500);
      return;
    }
  });

  document.addEventListener('mouseup', function() {
    if (_prodPressTimer) { clearTimeout(_prodPressTimer); _prodPressTimer = null; _prodPressTarget = null; }
  });

  /* ---- Edit product description ---- */
  function _startProdDescEdit(el) {
    if (el.querySelector('input, textarea')) return;
    var key = el.getAttribute('data-prod-key');
    var pd = productData[key]; if (!pd) return;
    var oldVal = el.textContent.trim();
    var ta = document.createElement('textarea');
    ta.value = oldVal;
    ta.style.cssText = 'width:100%;min-height:60px;font-size:12px;color:var(--text2);line-height:1.55;border:1px solid #6366F1;border-radius:6px;padding:8px 14px;resize:vertical;outline:none;background:rgba(255,255,255,.9);font-family:inherit;box-sizing:border-box;';
    el.textContent = ''; el.appendChild(ta);
    ta.focus(); ta.select();

    function save() {
      var newVal = ta.value.trim();
      var customDescs = {}; try { customDescs = JSON.parse(localStorage.getItem('_custom_prod_descs') || '{}'); } catch(ee) {}
      if (newVal && newVal !== pd.desc) { customDescs[key] = newVal; }
      else { delete customDescs[key]; }
      _saveCustomData('_custom_prod_descs', customDescs)
      el.textContent = newVal || pd.desc;
      _prodPressTarget = null;
    }
    ta.addEventListener('blur', save);
    ta.addEventListener('keydown', function(ev) {
      if (ev.key === 'Escape') { ta.value = oldVal; ta.blur(); }
    });
  }

  function _prodTagStyle(key){
    return 'color:#0055FF;background:rgba(0,85,255,.08);border-color:rgba(0,85,255,.15)';
  }
  /* ---- Edit product metric tag ---- */
  function _startProdTagEdit(el) {
    if (el.querySelector('input')) return;
    var wrap = el.closest('.prod-metrics-wrap');
    var key = wrap.getAttribute('data-prod-key');
    var idx = parseInt(el.getAttribute('data-metric-idx'));
    var oldVal = el.textContent.replace(/×/g, '').trim();

    var input = document.createElement('input');
    input.type = 'text'; input.value = oldVal;
    input.style.cssText = 'font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;'+_prodTagStyle(key)+';border:1px solid #6366F1;width:120px;outline:none;font-family:inherit;text-align:center;box-sizing:border-box;';
    el.textContent = ''; el.appendChild(input);
    input.focus(); input.select();

    function save() {
      var newVal = input.value.trim();
      var customMetrics = {}; try { customMetrics = JSON.parse(localStorage.getItem('_custom_prod_metrics') || '{}'); } catch(ee) {}
      var pd = productData[key];
      var defaults = pd && pd.metrics ? pd.metrics : [];
      if (!customMetrics[key]) customMetrics[key] = defaults.slice();
      if (newVal) { customMetrics[key][idx] = newVal; }
      else { customMetrics[key].splice(idx, 1); }
      _saveCustomData('_custom_prod_metrics', customMetrics)
      _prodPressTarget = null;
      /* Refresh the whole metrics row */
      _rebuildProdMetrics(wrap, key, customMetrics[key]);
    }

    input.addEventListener('blur', function() { setTimeout(function() { if (document.activeElement !== input) save(); }, 150); });
    input.addEventListener('keydown', function(ev) {
      if (ev.key === 'Enter') { input.blur(); }
      if (ev.key === 'Escape') { input.value = oldVal; input.blur(); }
    });
  }

  /* ---- Add new metric tag ---- */
  document.getElementById('modal-body').addEventListener('click', function(e) {
    if (document.body.classList.contains('edit-locked')) return;
    var addBtn = e.target.closest('.prod-metric-add');
    if (!addBtn) return;
    e.stopPropagation();
    var key = addBtn.getAttribute('data-prod-key');
    var wrap = addBtn.closest('.prod-metrics-wrap');
    var customMetrics = {}; try { customMetrics = JSON.parse(localStorage.getItem('_custom_prod_metrics') || '{}'); } catch(ee) {}
    var pd = productData[key];
    var defaults = pd && pd.metrics ? pd.metrics : [];
    if (!customMetrics[key]) customMetrics[key] = defaults.slice();
    customMetrics[key].push('新标签');
    _saveCustomData('_custom_prod_metrics', customMetrics)
    _rebuildProdMetrics(wrap, key, customMetrics[key]);
    /* Auto-edit the new tag */
    setTimeout(function() {
      var tags = wrap.querySelectorAll('.prod-metric-tag');
      var lastTag = tags[tags.length - 1];
      if (lastTag) { _startProdTagEdit(lastTag); }
    }, 50);
  });

  /* ---- Delete metric tag (called from inline onclick) ---- */
  window._delProdMetric = function(key, idx) {
    if (document.body.classList.contains('edit-locked')) return;
    var customMetrics = {}; try { customMetrics = JSON.parse(localStorage.getItem('_custom_prod_metrics') || '{}'); } catch(ee) {}
    var pd = productData[key];
    var defaults = pd && pd.metrics ? pd.metrics : [];
    if (!customMetrics[key]) customMetrics[key] = defaults.slice();
    customMetrics[key].splice(idx, 1);
    _saveCustomData('_custom_prod_metrics', customMetrics)
    var wrap = document.querySelector('.prod-metrics-wrap[data-prod-key="' + key + '"]');
    if (wrap) _rebuildProdMetrics(wrap, key, customMetrics[key]);
  };

  /* ---- Rebuild metrics row DOM ---- */
  function _rebuildProdMetrics(wrap, key, arr) {
    var addHtml = '<span class="prod-metric-add" data-prod-key="' + key + '" style="font-size:11px;font-weight:400;color:var(--text3);padding:3px 10px;border-radius:99px;background:transparent;border:1px solid rgba(0,0,0,.1);cursor:pointer;user-select:none">+ 添加</span>';
    if (!arr || !arr.length) { wrap.innerHTML = addHtml; return; }
    var h = '';
    arr.forEach(function(m, idx) {
      h += '<span class="prod-metric-tag" data-metric-idx="' + idx + '" style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;'+_prodTagStyle(key)+';position:relative;cursor:default">' + m + '<button class="prod-metric-del" onclick="event.stopPropagation();window._delProdMetric(\x27' + key + '\x27,' + idx + ')" style="display:none;position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;background:#EF4444;color:#fff;border:none;cursor:pointer;font-size:10px;line-height:1;padding:0">&times;</button></span>';
    });
    wrap.innerHTML = h + addHtml;
  }

  // Long-press to edit design gallery item name & type (delegation on #modal-body)
  /* ---- Solution Design: long-press to edit desc / section title / body ---- */
  function _saveSlnData(key, data) {
    var all = {}; try { all = JSON.parse(localStorage.getItem('_custom_sln_data') || '{}'); } catch(ee) {}
    all[key] = data;
    _saveCustomData('_custom_sln_data', all)
  }
  function _getSlnData(key, d) {
    var all = {}; try { all = JSON.parse(localStorage.getItem('_custom_sln_data') || '{}'); } catch(ee) {}
    if (all[key]) return all[key];
    return { desc: d.desc, sections: (d.sections||[]).map(function(s){return {h:s.h, b:s.b};}) };
  }

  var _slnEditTimer=null, _slnEditTarget=null;
  document.getElementById('modal-body').addEventListener('mousedown', function(e) {
    if (document.body.classList.contains('edit-locked')) return;
    var el = e.target.closest('.sln-desc-text, .sln-sec-title, .sln-sec-body, .mgmt-step-title, .mgmt-step-body, .mgmt-tag-seg');
    if (!el) return;
    _slnEditTarget = el;
    _slnEditTimer = setTimeout(function() {
      _slnEditTimer = null;
      _startSlnEdit(el);
    }, 500);
  });
  document.addEventListener('mouseup', function() {
    if (_slnEditTimer) { clearTimeout(_slnEditTimer); _slnEditTimer = null; _slnEditTarget = null; }
  });

  /* Doc modal description — in modal header, delegation via #modal */
  var _docDescTimer = null;
  document.getElementById('modal').addEventListener('mousedown', function(e) {
    if (document.body.classList.contains('edit-locked')) return;
    var el = e.target.closest('.modal-desc[data-doc-desc-key], .modal-desc[data-design-desc-key]');
    if (!el) return;
    _docDescTimer = setTimeout(function() {
      _docDescTimer = null;
      _startSlnEdit(el);
    }, 500);
  });
  document.addEventListener('mouseup', function() {
    if (_docDescTimer) { clearTimeout(_docDescTimer); _docDescTimer = null; }
  });

  function _startSlnEdit(el) {
    if (el.querySelector('input, textarea')) return;
    /* Doc modal description */
    /* Mgmt tag segment */
    if (el.classList.contains('mgmt-tag-seg')) {
      var tKey = el.getAttribute('data-mgmt-key');
      var tStepIdx = parseInt(el.getAttribute('data-step-idx'));
      var tSegIdx = parseInt(el.getAttribute('data-tag-seg'));
      var tOldVal = el.textContent.trim();
      var tInput = document.createElement('input');
      tInput.type = 'text'; tInput.value = tOldVal;
      tInput.style.cssText = 'font-size:10px;font-weight:500;color:var(--text3);border:1px solid #6366F1;border-radius:4px;padding:1px 4px;width:80px;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;font-family:inherit;';
      el.textContent = ''; el.appendChild(tInput);
      tInput.focus(); tInput.select();
      function saveTag() {
        var newVal = tInput.value.trim();
        var steps = {}; try { steps = JSON.parse(localStorage.getItem('_custom_mgmt_steps') || '{}'); } catch(ee) {}
        if (!steps[tKey]) { steps[tKey] = JSON.parse(JSON.stringify(data[tKey].steps)); }
        var parts = (steps[tKey][tStepIdx].sub||'').split(' · ');
        parts[tSegIdx] = newVal || tOldVal;
        steps[tKey][tStepIdx].sub = parts.join(' · ');
        _saveCustomData('_custom_mgmt_steps', steps)
        el.textContent = newVal || tOldVal;
        _slnEditTarget = null;
      }
      tInput.addEventListener('blur', saveTag);
      tInput.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') tInput.blur(); if (ev.key === 'Escape') { tInput.value = tOldVal; tInput.blur(); } });
      return;
    }
    /* Mgmt step title / body */
    if (el.classList.contains('mgmt-step-title') || el.classList.contains('mgmt-step-body')) {
      var mgmtKey = el.getAttribute('data-mgmt-key');
      var stepIdx = parseInt(el.getAttribute('data-step-idx'));
      var isBody = el.classList.contains('mgmt-step-body');
      var oldVal3 = el.textContent.trim();
      var input2 = document.createElement(isBody ? 'textarea' : 'input');
      if (isBody) {
        input2.value = oldVal3;
        input2.style.cssText = 'font-size:12px;color:var(--text2);line-height:1.55;border:1px solid #6366F1;border-radius:6px;padding:4px 8px;width:100%;min-height:36px;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;font-family:inherit;resize:vertical;';
      } else {
        input2.type = 'text'; input2.value = oldVal3;
        input2.style.cssText = 'font-size:14px;font-weight:700;color:#283c54;border:1px solid #6366F1;border-radius:6px;padding:2px 6px;width:100%;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;font-family:inherit;';
      }
      el.textContent = ''; el.appendChild(input2);
      input2.focus(); input2.select();
      function save2() {
        var newVal = input2.value.trim();
        var steps = {}; try { steps = JSON.parse(localStorage.getItem('_custom_mgmt_steps') || '{}'); } catch(ee) {}
        if (!steps[mgmtKey]) { steps[mgmtKey] = JSON.parse(JSON.stringify(data[mgmtKey].steps)); }
        if (isBody) { steps[mgmtKey][stepIdx].detail = newVal || oldVal3; }
        else { steps[mgmtKey][stepIdx].title = newVal || oldVal3; }
        _saveCustomData('_custom_mgmt_steps', steps)
        el.textContent = newVal || oldVal3;
        _slnEditTarget = null;
      }
      input2.addEventListener('blur', save2);
      input2.addEventListener('keydown', function(ev) { if (ev.key === 'Escape') { input2.value = oldVal3; input2.blur(); } });
      return;
    }
    if (el.classList.contains('modal-desc')) {
      var docKey = el.getAttribute('data-doc-desc-key') || el.getAttribute('data-design-desc-key');
      if (!el.hasAttribute('data-design-desc-key') && !docData[docKey]) return;
      var oldVal2 = el.textContent.trim();
      var ta = document.createElement('textarea');
      ta.value = oldVal2;
      ta.style.cssText = 'width:100%;min-height:40px;font-size:12px;color:var(--text2);line-height:1.55;border:1px solid #6366F1;border-radius:6px;padding:4px 8px;resize:vertical;outline:none;background:rgba(255,255,255,.9);font-family:inherit;box-sizing:border-box;';
      el.textContent = ''; el.appendChild(ta);
      ta.focus(); ta.select();
      function save() {
        var newVal = ta.value.trim();
        _updateSlnField(docKey, null, el, newVal, oldVal2);
        el.textContent = newVal || oldVal2;
        _slnEditTarget = null;
      }
      ta.addEventListener('blur', save);
      ta.addEventListener('keydown', function(ev) { if (ev.key === 'Escape') { ta.value = oldVal2; ta.blur(); } });
      return;
    }
    var key = el.closest('[data-sln-key]').getAttribute('data-sln-key');
    var d = data[key]; if (!d) return;
    var oldVal = el.textContent.trim();

    var isTextarea = el.classList.contains('sln-sec-body') || el.classList.contains('sln-desc-text');
    if (isTextarea) {
      var ta = document.createElement('textarea');
      ta.value = oldVal;
      ta.style.cssText = 'width:100%;min-height:50px;font-size:12px;color:var(--text2);line-height:1.55;border:1px solid #6366F1;border-radius:6px;padding:6px 10px;resize:vertical;outline:none;background:rgba(255,255,255,.9);font-family:inherit;box-sizing:border-box;';
      el.textContent = ''; el.appendChild(ta);
      ta.focus(); ta.select();
      function save() {
        var newVal = ta.value.trim();
        _updateSlnField(key, d, el, newVal, oldVal);
        el.textContent = newVal || oldVal;
        _slnEditTarget = null;
      }
      ta.addEventListener('blur', save);
      ta.addEventListener('keydown', function(ev) { if (ev.key === 'Escape') { ta.value = oldVal; ta.blur(); } });
    } else {
      var input = document.createElement('input');
      input.type = 'text'; input.value = oldVal;
      input.style.cssText = 'font-size:14px;font-weight:700;color:#283c54;border:1px solid #6366F1;border-radius:6px;padding:2px 6px;width:100%;box-sizing:border-box;background:rgba(255,255,255,.9);outline:none;font-family:inherit;';
      el.textContent = ''; el.appendChild(input);
      input.focus(); input.select();
      function save() {
        var newVal = input.value.trim();
        _updateSlnField(key, d, el, newVal, oldVal);
        el.textContent = newVal || oldVal;
        _slnEditTarget = null;
      }
      input.addEventListener('blur', save);
      input.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { input.blur(); } if (ev.key === 'Escape') { input.value = oldVal; input.blur(); } });
    }
  }

  function _updateSlnField(key, d, el, newVal, oldVal) {
    if (el.classList.contains('modal-desc')) {
      if (el.hasAttribute('data-design-desc-key')) {
        /* Design modal description */
        _saveCustomData('_design_desc', newVal || oldVal)
        return;
      }
      /* Doc modal description */
      var descs = {}; try { descs = JSON.parse(localStorage.getItem('_custom_doc_descs') || '{}'); } catch(ee) {}
      if (newVal && newVal !== oldVal) { descs[key] = newVal; }
      else { delete descs[key]; }
      _saveCustomData('_custom_doc_descs', descs)
      if (docData[key]) docData[key].desc = newVal || oldVal;
      return;
    }
    var slnData = _getSlnData(key, d);
    if (el.classList.contains('sln-desc-text')) {
      slnData.desc = newVal || d.desc;
    } else if (el.classList.contains('sln-sec-title') || el.classList.contains('sln-sec-body')) {
      var section = el.closest('.sln-section');
      var idx = parseInt(section.getAttribute('data-section-idx'));
      if (el.classList.contains('sln-sec-title')) { slnData.sections[idx].h = newVal || d.sections[idx].h; }
      else { slnData.sections[idx].b = newVal || d.sections[idx].b; }
    }
    _saveSlnData(key, slnData);
  }

  /* Add new section */
  document.getElementById('modal-body').addEventListener('click', function(e) {
    if (document.body.classList.contains('edit-locked')) return;
    var addBtn = e.target.closest('.sln-sec-add');
    if (!addBtn) return;
    e.stopPropagation();
    var key = addBtn.getAttribute('data-sln-key');
    var d = data[key]; if (!d) return;
    var slnData = _getSlnData(key, d);
    slnData.sections.push({ h: '新标题', b: '新内容' });
    _saveSlnData(key, slnData);
    _rebuildSlnSections(key, d, slnData);
  });

  /* Delete section */
  window._delSlnSection = function(key, idx) {
    if (document.body.classList.contains('edit-locked')) return;
    var d = data[key]; if (!d) return;
    var slnData = _getSlnData(key, d);
    idx = parseInt(idx);
    if (isNaN(idx) || idx < 0 || idx >= slnData.sections.length) return;
    slnData.sections.splice(idx, 1);
    _saveSlnData(key, slnData);
    _rebuildSlnSections(key, d, slnData);
  };

  function _rebuildSlnSections(key, d, slnData) {
    var wrap = document.querySelector('.sln-sections-wrap[data-sln-key="' + key + '"]');
    if (!wrap) return;
    var h = '';
    (slnData.sections||[]).forEach(function(s, idx) {
      h += '<div class="msec sln-section" data-section-idx="' + idx + '" style="margin-bottom:12px"><h4 class="sln-sec-title">' + s.h + '</h4><p class="sln-sec-body">' + s.b + '</p><button class="sln-sec-del" onclick="event.stopPropagation();window._delSlnSection(\x27' + key + '\x27,' + idx + ')" style="display:none;position:absolute;top:0;right:0;width:18px;height:18px;border-radius:50%;background:#EF4444;color:#fff;border:none;cursor:pointer;font-size:10px;line-height:1;padding:0">&times;</button></div>';
    });
    h += '<span class="sln-sec-add" data-sln-key="' + key + '" style="display:inline-block;font-size:11px;font-weight:400;color:var(--text3);padding:2px 8px;border-radius:20px;background:transparent;border:1px solid rgba(0,0,0,.1);cursor:pointer;margin-bottom:14px">+ 添加</span>';
    wrap.innerHTML = h;
  }

  // Design modal — async load from IndexedDB, localStorage fallback, then render
  (function(){var dl=document.querySelector('.design-portfolio-link');if(!dl)return;dl.addEventListener('click',function(e){e.stopPropagation();var th='<h3>代表设计</h3><p class=\"modal-desc\"><span style=\"white-space:nowrap\">在埃森哲任职期间，先后服务百威、永辉、达能、罗森等国内外客户，负责项目覆盖全终端类型，这段经历积累了跨端设计能力和国际化项目交付经验，</span><br>也为后续产品转型奠定了从视觉到业务的完整视角。</p>';
    var results=[];var pending=0;
    function render(){var bh='<div class=\"design-gallery\">';_di.forEach(function(it,idx){var arr=results[idx]||[];var hu=arr.length>0;var cover=it.im[0];bh+='<div class=\"design-gallery-item\"'+(hu?' onclick=\"event.stopPropagation();openLightbox(\x27'+arr[0]+'\x27,\x27'+JSON.stringify(arr).replace(/\"/g,'&quot;')+'\x27,\x27design_img_'+idx+'\x27,'+idx+')\" style=\"cursor:pointer\"':' style=\"cursor:default\"')+'><div class=\"dg-img-wrap\"><img src=\"'+cover+'\" alt=\"'+it.p+'\" loading=\"lazy\" onerror=\"imgFallback(this)\">';if(hu)bh+='<span class=\"design-badge\" style=\"position:absolute;bottom:8px;left:50%;transform:translateX(-50%);z-index:5;background:rgba(0,0,0,.25);color:#fff;font-size:10px;padding:2px 8px;border-radius:12px;pointer-events:none\">'+arr.length+'张</span>';bh+='<div class=\"dg-actions\"><label class=\"dg-act-btn\" title=\"上传\" onclick=\"event.stopPropagation()\"><input type=\"file\" accept=\"image/*\" multiple style=\"display:none\" onchange=\"window._du(event,'+idx+')\"><svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"pointer-events:none\"><line x1=\"12\" y1=\"19\" x2=\"12\" y2=\"5\"/><polyline points=\"5 12 12 5 19 12\"/></svg></label>';if(hu)bh+='<button class=\"dg-act-btn dg-del-btn\" title=\"清除\" onclick=\"event.stopPropagation();window._dd('+idx+')\"><svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2\"/></svg></button>';bh+='</div></div><div class=\"dg-info\"><strong>'+it.p+' · '+it.t+'</strong></div></div>';});bh+='</div>';document.querySelector('.modal-box').classList.add('glass');document.getElementById('modalHeaderContent').innerHTML=th;document.getElementById('modal-body').innerHTML=bh;var modal=document.getElementById('modal');modal.classList.add('on');modal.scrollTop=0;document.body.style.overflow='hidden';}
    _di.forEach(function(it,idx){_designLoad('design_img_'+idx,function(imgs){results[idx]=imgs;pending++;if(pending>=_di.length)render();});});
  });})();

  /* ==============================
     Permissions System
     ============================== */
  (function(){
    var PERM_KEY = '_perm_edit_enabled';
    var PASSCODE = '18616742788';

    /* Apply saved permission state on load */
    function applyPermState() {
      var saved = localStorage.getItem(PERM_KEY);
      if (saved === '0') {
        document.body.classList.add('edit-locked');
      } else {
        document.body.classList.remove('edit-locked');
      }
    }
    applyPermState();

    /* 5-click detection on Evan */
    var evanEl = document.getElementById('evanTrigger');
    if (!evanEl) return;
    var clickCount = 0;
    var clickTimer = null;
    evanEl.addEventListener('click', function(e) {
      e.stopPropagation();
      clickCount++;
      if (clickTimer) clearTimeout(clickTimer);
      if (clickCount >= 5) {
        clickCount = 0;
        openPermModal();
      } else {
        clickTimer = setTimeout(function() { clickCount = 0; }, 2000);
      }
    });

    /* Modal elements */
    var overlay = document.getElementById('permOverlay');
    var toggleInput = document.getElementById('permToggleInput');
    var toggleText = document.getElementById('permToggleText');
    var passwordInput = document.getElementById('permPassword');
    var hintEl = document.getElementById('permHint');
    var confirmBtn = document.getElementById('permConfirm');
    var eyeBtn = document.getElementById('permEye');
    var closeBtn = document.getElementById('permClose');

    /* Eye icon SVG paths — closed eye (default) and open eye */
    var EYE_OFF = '<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
    var EYE_ON = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';

    var pwRow = document.querySelector('.perm-row-pw');
    function openPermModal() {
      var saved = localStorage.getItem(PERM_KEY);
      var enabled = (saved !== '0');
      toggleInput.checked = enabled;
      toggleText.textContent = enabled ? '已开启' : '已关闭';
      passwordInput.value = '';
      passwordInput.type = 'password';
      eyeBtn.querySelector('svg').innerHTML = EYE_OFF;
      hintEl.textContent = '';
      hintEl.className = 'perm-hint';
      /* 密码输入框默认隐藏，仅切换时显示 */
      pwRow.style.display = 'none';
      overlay.classList.add('on');
    }

    function closePermModal() {
      overlay.classList.remove('on');
    }

    /* Toggle switch — 显示/隐藏密码输入框 */
    toggleInput.addEventListener('change', function() {
      toggleText.textContent = this.checked ? '已开启' : '已关闭';
      pwRow.style.display = 'flex';
      setTimeout(function() { passwordInput.focus(); }, 200);
    });

    /* Eye button — toggle password visibility */
    eyeBtn.addEventListener('click', function() {
      var isPassword = (passwordInput.type === 'password');
      passwordInput.type = isPassword ? 'text' : 'password';
      eyeBtn.querySelector('svg').innerHTML = isPassword ? EYE_ON : EYE_OFF;
      eyeBtn.title = isPassword ? '隐藏密码' : '显示密码';
    });

    /* Confirm */
    confirmBtn.addEventListener('click', function() {
      var pw = passwordInput.value.trim();
      if (pw !== PASSCODE) {
        hintEl.textContent = '密码错误，请重试';
        hintEl.className = 'perm-hint error';
        return;
      }
      var enabled = toggleInput.checked;
      localStorage.setItem(PERM_KEY, enabled ? '1' : '0');
      applyPermState();
      closePermModal();
      /* Toast notification */
      var toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = '<span class="toast-icon"><svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,4 3.5,6.5 9,1"/></svg></span>' + (enabled ? '文件权限已开启' : '文件权限已关闭');
      document.body.appendChild(toast);
      setTimeout(function() { toast.classList.add('show'); }, 10);
      setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, 1500);
    });

    /* Enter key on password */
    passwordInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') confirmBtn.click();
    });

    /* Close */
    closeBtn.addEventListener('click', closePermModal);
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) closePermModal();
    });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && overlay.classList.contains('on')) closePermModal();
    });
  })();

  /* 自定义滚动条 + 底部箭头 */
  function _injectScrollArrows(){
    document.querySelectorAll('.img-scroll:not(.arrow-injected)').forEach(function(wrap){
      wrap.classList.add('arrow-injected');
      var parent=wrap.parentNode;
      var wrapper=document.createElement('div');wrapper.className='img-scroll-wrap';
      var barWrap=document.createElement('div');barWrap.className='img-scroll-bar-wrap';
      var leftBtn=document.createElement('button');leftBtn.className='img-scroll-arrow';leftBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>';
      var track=document.createElement('div');track.className='img-scroll-track';
      var thumb=document.createElement('div');thumb.className='img-scroll-thumb';
      track.appendChild(thumb);
      var rightBtn=document.createElement('button');rightBtn.className='img-scroll-arrow';rightBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>';
      barWrap.appendChild(leftBtn);barWrap.appendChild(track);barWrap.appendChild(rightBtn);
      parent.insertBefore(wrapper,wrap);wrapper.appendChild(wrap);wrapper.appendChild(barWrap);
      /* 更新滚动条 */
      function updateBar(){
        var total=wrap.scrollWidth, visible=wrap.clientWidth;
        if(total<=visible+4){barWrap.classList.remove('visible');return;}
        barWrap.classList.add('visible');
        var trackW=track.clientWidth;
        var ratio=visible/total;
        thumb.style.width=Math.max(20,ratio*trackW)+'px';
        var maxLeft=trackW-parseFloat(thumb.style.width);
        var scrollRatio=wrap.scrollLeft/(total-visible);
        thumb.style.left=(scrollRatio*maxLeft)+'px';
      }
      leftBtn.addEventListener('click',function(ev){ev.stopPropagation();ev.preventDefault();wrap.scrollBy({left:-250,behavior:'smooth'});});
      rightBtn.addEventListener('click',function(ev){ev.stopPropagation();ev.preventDefault();wrap.scrollBy({left:250,behavior:'smooth'});});
      /* 拖动滑块 */
      thumb.addEventListener('mousedown',function(ev){ev.stopPropagation();ev.preventDefault();var total=wrap.scrollWidth,visible=wrap.clientWidth;var trackW=track.clientWidth,thumbW=parseFloat(thumb.style.width)||20;var maxLeft=trackW-thumbW;if(maxLeft<=0)return;var startX=ev.pageX,startLeft=parseFloat(thumb.style.left)||0;function onMove(e2){var dx=e2.pageX-startX;var newLeft2=Math.max(0,Math.min(maxLeft,startLeft+dx));thumb.style.left=newLeft2+'px';wrap.scrollLeft=(newLeft2/maxLeft)*(total-visible);}function onUp(){document.removeEventListener('mousemove',onMove);document.removeEventListener('mouseup',onUp);}document.addEventListener('mousemove',onMove);document.addEventListener('mouseup',onUp);});
      wrap.addEventListener('scroll',updateBar);window.addEventListener('resize',updateBar);
      setTimeout(updateBar,100);setTimeout(updateBar,600);
    });
  }

  // 延迟加载云端内容（等页面渲染完成后）
  setTimeout(function() { _initCloudContent(); }, 2000);

  /** 从 Supabase Storage 下载文件到本地缓存 */
  function _syncFilesFromCloud() {
    if (!window.DS || !window.DS.isOnline()) return;

    // 扫描所有 category，从云端拉文件列表
    var CATS = ['doc', 'sln', 'design', 'prod'];
    var allTasks = [];

    // 1. 先扫描 local key（已有上传记录的）
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k) continue;
      var cat = null;
      if (k.indexOf('docimg_') === 0) cat = 'doc';
      else if (k.indexOf('sln_file_') === 0) cat = 'sln';
      else if (k.indexOf('design_img_') === 0) cat = 'design';
      else if (k.indexOf('prod_imgs_') === 0) cat = 'prod';
      if (!cat) continue;
      allTasks.push({ key: k, cat: cat });
    }

    // 2. 再按 category 全局扫描（发现新 key）
    CATS.forEach(function(cat) {
      allTasks.push({ key: '', cat: cat, global: true });
    });

    var seen = {};
    allTasks.forEach(function(t) {
      window.DS.listFiles(t.cat, t.key).then(function(files) {
        if (!files || !files.length) return;
        // 按 key 分组
        var groups = {};
        files.forEach(function(f) {
          var parts = f.path.split('/');
          // path: category/key/filename -> key is parts[1]
          var fkey = parts[1] || t.key;
          if (!groups[fkey]) groups[fkey] = [];
          groups[fkey].push(f.url);
        });
        // 合并到本地
        Object.keys(groups).forEach(function(fkey) {
          if (seen[fkey]) return;
          seen[fkey] = true;
          var newUrls = groups[fkey];
          var existing = [];
          try {
            var raw = localStorage.getItem(fkey);
            if (raw) {
              var parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && !(parsed.length === 1 && parsed[0] === '__IDB__')) {
                existing = parsed;
              }
            }
          } catch(e) {}
          var added = newUrls.filter(function(u) { return existing.indexOf(u) === -1; });
          if (added.length) {
            var merged = existing.concat(added);
            try { localStorage.setItem(fkey, JSON.stringify(merged)); } catch(e) {}
            if (fkey.indexOf('docimg_') === 0) window._docImgs[fkey] = merged;
            if (!sessionStorage.getItem('_files_sync_once')) {
              sessionStorage.setItem('_files_sync_once', '1');
              setTimeout(function() { location.reload(); }, 800);
            }
          }
        });
      }).catch(function() {});
    });
  }
  setTimeout(function() { _syncFilesFromCloud(); }, 3000);

})();
