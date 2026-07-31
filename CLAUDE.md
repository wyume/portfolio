# Portfolio（改进版）— 作品集项目文档

## 2026-07-31 更新日志

### 全民展业 Logo 设计
- 多次迭代最终确定：亮蓝径向渐变圆角矩形 + 白色手持POS机具图形
- 文件：`images/quanzhanye-logo.svg`

### 标签颜色统一
- 所有产品弹窗标签统一为蓝色 `#0055FF`（品牌色），不再按分类分色
- 涉及 `script.js` 中 `dotColor`/`tagBg`/`_prodTagStyle` 三处

### 卡片顺序调整
- 社交电商类移至最后，金融支付类保持不变
- 导航和筛选按钮同步更新

### 产品描述更新
- 中数链数字版权交易系统：四方业务模式、数藏玩法覆盖
- 国版数创：商户入驻、资产发行、市场流转
- 中数链浏览器：链上核验工具定位
- 移除上述三个产品的 hardcoded outputs

### Hero 区域可编辑
- 标题和描述文字支持长按编辑，保存同步云端
- 修改后顶部导航同步更新
- 鼠标移入显示手指光标

### 方案文件预览修复
- 点击哪个文件预览就从哪个开始，不再总是从第一个

### 代表产品 → 产品选集
- 导航、筛选按钮、section 标题统一改名

### 2026-07-30 更新日志

### 警音小程序 Logo
- 新增 `images/警音.png`，弹窗中 28px 显示

### 区块链产品描述重写
- 中数链 / 国版数创 / 中数链浏览器 描述更新 + 移除 outputs

### 全民展业 Logo
- 新增 `images/quanzhanye-logo.svg`

### 产品标签成果化
- 全部 20 个产品各新增 3-4 个成果导向 metrics

---

## 2026-07-28 更新日志

### 跨浏览器数据双向同步（重大改造）
- **问题**：Chrome 上传的图片在搜狗浏览器看不到，删除后刷新又恢复，两个浏览器数据不一致
- **根因**：
  1. Supabase Storage list API 对匿名用户不可用，`_syncFilesFromCloud` 永远拿不到文件列表
  2. 产品弹窗加载只读 IndexedDB → sessionStorage，不读 localStorage
  3. 删除操作不更新云端 `_cloud_file_urls`，刷新后被重新下载回来
  4. `_initCloudContent` 和删除操作存在竞态条件，互相覆盖 `_cloud_file_urls`
- **修复**：
  - 上传时：`_saveCloudFileUrl(key, url)` 将 Supabase URL 持久化到 localStorage + `portfolio_content` 表的 `_cloud_file_urls` 键
  - 下载时：`_initCloudContent` 从云端下载 `_cloud_file_urls`，合并 URL 到对应 localStorage key
  - 加载时：产品弹窗增加 localStorage 回退路径（IndexedDB → sessionStorage → localStorage）
  - 删除时：四个删除函数（`_prodDelImg`/`_slnFileDel`/`_docDel`/`_dd`）均调用 `_syncCloudUrlsAfterDelete` 同步云端
  - 协调时：`_initCloudContent` 双向协调——云端有本地无则添加，本地有云端无则删除（含 IndexedDB 清理）
  - 竞态修复：`_initCloudContent` 不再上传 `_cloud_file_urls`，该键由专用函数管理
  - 其他修复：`_prodGetImgs` 增加 localStorage 回退、`_prodRebuild`/`_slnFileRebuild` 同步写 localStorage、空数组保留 key 而非 delete、reload 延迟 300ms 等 IndexedDB 写入

### 代表产品标签增强
- 全部 20 个产品各新增 3-4 个成果导向标签（metrics），原有标签保留不删
- 覆盖反诈类（4产品）、区块链类（4产品）、互联网金融类（4产品）、金融支付类（4产品）、社交电商类（4产品）

### Git 历史重写
- 首次 commit message 从"基础版本：产品经理项目选集，含云端数据持久化、响应式适配、密码门"改为"profile"
- Force push 到 GitHub，旧描述已从提交历史中移除

### 文件变更
| 文件 | 变更 |
|------|------|
| `script.js` | 大量修改（跨浏览器同步、删除同步、标签新增） |
| `CLAUDE.md` | 更新日志 |

## 2026-07-27 更新日志

### 图片压缩品质提升
- **Canvas 压缩参数提高**：最大宽度 1200px → 2400px，JPEG 质量 0.7 → 0.85
- 涉及 4 处：`script.js` 的 `_docUp` / `_slnUpload` / `_du` + `prod-upload.js` 的 `compress`
- 修复 Retina/HiDPI 屏幕上上传后图片模糊的问题

### Mac 跨平台样式修复（style.css）
- **字体渲染**：`-webkit-font-smoothing: antialiased` → `subpixel-antialiased`，新增 `-moz-osx-font-smoothing: auto`
- **嵌套毛玻璃**：移除 `.auth-card` 的 `backdrop-filter`，解决 Safari 渲染异常
- **Firefox 滚动条**：全局 + 隐藏容器 + 水平容器全部加上 `scrollbar-width` / `scrollbar-color`
- **饱和度降低**：`saturate(200/220/300%)` → `150%`，`saturate(180%)` → `140%`，减少 macOS Safari P3 广色域与 Windows Chrome 之间的视觉效果差异
- **`.design-gallery-item` 死代码**：删除被立即覆盖的 `background: rgba(255,255,255,.3)`
- **PDF 预览高度**：`+17px` → `+20px` + `margin-bottom:-20px`，Windows/macOS 滚动条差异不再影响显示
- **`@supports` 渐进增强**：不支持 `backdrop-filter` 的浏览器回退到纯色背景

### 云端数据持久化（Supabase 后端）
- **新增 `data-service.js`**：Supabase 云端数据服务模块，暴露为 `window.DS`
  - `DS.saveContent()` / `DS.loadContent()` — 文本内容 cloud sync
  - `DS.uploadCompressedImage()` / `DS.uploadFile()` — 文件上传到 Supabase Storage
  - `DS.listFiles()` / `DS.deleteFile()` — 云端文件管理
  - `DS.migrateFromLocal()` — 本地数据一键迁移
- **`script.js` 改造**：
  - 新增 `_saveCustomData(key, data)` — localStorage + Supabase 双写
  - 新增 `_initCloudContent()` — 页面加载时从云端拉取文本，合并到 localStorage
  - 新增 `_autoMigrateIfNeeded()` — 首次自动将本地文本同步到云端
  - 4 个上传函数的 `finish()` 中增加云端上传（`_docUp` / `_slnUpload` / `_du` / `_prodUpload`）
  - 所有文本编辑相关 `localStorage.setItem` 替换为 `_saveCustomData`
- **`index.html`**：在 `script.js` 之前引入 `data-service.js`
- **Supabase 建表 SQL** 需用户在 Supabase SQL Editor 中执行一次（见下方"部署指南"）

### 代表设计上传修复
- 已上传图片后点击上传按钮不再弹出预览弹窗，正确打开文件选择器
- 上传按钮的 `<label>` 添加 `onclick="event.stopPropagation()"` 阻止事件冒泡

### 产品数据补全
- 新增 `feiyu`（飞鱼合伙人 App）和 `maishou`（买手商户平台）的 `productData`，点击后正确显示弹窗

### 全民反诈 Logo 更新
- 替换为透明底版本的 `全民反诈logo.png`
- 弹窗中 `logoBg: false` 去除白色背景容器

### 项目管理弹窗优化
- 主标题与步骤矩形左边缘对齐（`padding-left: 24px`）
- 三根彩色竖线高度略微缩短（`margin: 2px 0` → `4px 0`）

### 移动端/平板响应式优化
- **480px（手机）**：筛选/导航按钮最小高度 36px（触控友好）、产品截图改为百分比宽度自适应、技能云 2 列、密码门加滚动防键盘遮挡、返回顶部按钮缩小
- **768px（平板竖屏）**：产品截图改为百分比宽度自适应
- **横屏手机**：`max-height: 500px` 断点，密码门和弹窗自适应短屏
- **大屏桌面**：`min-width: 1400px` 断点，内容区加宽、字号放大（适配 16 寸 MacBook）
- 修复 `.modal-body h3` → `#modal-body h3` 选择器笔误

### 文档撰写弹窗
- 尝试主标题左侧加圆点装饰（实心/空心/半透明几种方案），最终去掉保持简洁

### 文件变更清单
| 文件 | 变更类型 |
|------|----------|
| `script.js` | 大量修改（压缩参数、cloud sync、产品数据、上传修复等） |
| `style.css` | 大量修改（Mac 修复、响应式优化、saturate 降低等） |
| `data-service.js` | **新文件** |
| `prod-upload.js` | 修改（压缩参数 + cloud upload） |
| `index.html` | 修改（引入 data-service.js） |
| `images/全民反诈logo.png` | 替换（透明底版本） |

### 部署指南（Supabase 建表 SQL）
用户在 Supabase SQL Editor 中执行一次即可启用云端同步：
```sql
CREATE TABLE IF NOT EXISTS portfolio_content (
    id BIGSERIAL PRIMARY KEY, key TEXT NOT NULL UNIQUE,
    value JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_portfolio_content_key ON portfolio_content(key);
ALTER TABLE portfolio_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_select_content" ON portfolio_content FOR SELECT TO anon USING (true);
CREATE POLICY "allow_insert_content" ON portfolio_content FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "allow_update_content" ON portfolio_content FOR UPDATE TO anon USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('portfolio-files', 'portfolio-files', true, 52428800) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "allow_select_storage" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'portfolio-files');
CREATE POLICY "allow_insert_storage" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'portfolio-files');
CREATE POLICY "allow_delete_storage" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'portfolio-files');
CREATE POLICY "allow_update_storage" ON storage.objects FOR UPDATE TO anon USING (bucket_id = 'portfolio-files');
```

---

## 2026-07-24 更新日志

### 文档撰写模块 — 预览弹窗统一重构
- **文件上传**：支持图片 + PDF + Word + PPT 混合上传，Canvas 压缩（1200px / JPEG 0.7），PDF/Word/PPT 读取为 base64
- **上传进度**：环形进度条（conic-gradient）+ 百分比数字
- **统一预览弹窗**（`_openDocLightbox` / `_buildDocLightbox`）：
  - 顶部玻璃导航栏：文档名称（支持自定义名称） + 文件数量徽章 + 删除按钮 + 关闭按钮
  - 文件展示区：图片直接展示、PDF iframe 嵌入（PPT 16:9 / Word 3:4 比例自适应）、Word/PPT 下载卡片
  - 左右箭头循环切换
  - 中间水印
  - 点击空白区域关闭
  - 数量徽章始终显示（未上传时 0/0）
- **单文件删除**：预览弹窗内可删除当前展示的文件，删除后同步更新卡片徽章
- **卡片徽章**：上传后显示文件数量，去掉了旧的"张"后缀
- **权限控制**：`edit-locked` 状态下隐藏所有删除按钮

### 数据持久化修复
- **`__IDB__` 标记机制**：大文件（PDF/Word/PPT）超出 localStorage 3MB 限制时，写入 `["__IDB__"]` 标记，页面初始化时从 IndexedDB 异步预加载
- **`_docLoad` 超时延长**：从 1.2s 延长至 2s，减少 IndexedDB 慢响应导致的空数据
- **存储双写**：localStorage（小文件）+ IndexedDB（所有文件），刷新不丢失

### 代表设计 — 图片预览单张删除
- **Lightbox 增强**：`openLightbox(src, imgs, delKey, delCardIdx)` 支持可选删除参数
- **删除按钮**：右上角垃圾桶图标，hover 变红，删除后同步 localStorage/IndexedDB + 卡片徽章
- **权限控制**：`edit-locked` 状态下删除按钮隐藏

### CSS 修复与增强
- 修复 `.modal-box.glass .modal-header` 重复冲突规则
- 移除空的 `.card.mgmt-stat {}` 块
- 修复 `.design-gallery-item` 选择器重复
- 新增 `@media print` 打印样式（隐藏交互元素，保留内容网格）
- 产品/文档预览提示文字统一：`opacity: 1` 始终显示，颜色 `var(--text3)`
- 数量徽章统一样式：`font-size: 11px; padding: 3px 10px`，玻璃质感白底

### HTML 增强
- 新增 JSON-LD 结构化数据（Person + WebSite Schema）
- 新增 `<link rel="canonical">` SEO 标签
- 导航栏邮箱链接修复（`href="#"` + `event.preventDefault()`）
- 电话元素添加 `role="button"` + `tabindex="0"` + `aria-label`

### 脚本优化
- `analytics-tracker.js` 从 `async` 改为 `defer`，不阻塞首屏渲染

### 备份说明
- 以上所有改动已完成并保存为备份文件，后续可随时恢复

---

## 与原始版本的主要改进

### P0 — 信息完整性
- ✅ SEO meta 标签（description、og:title/image、robots）
- ✅ Hero 区精准定位：10年经验 + 管理规模 + 核心能力 + 地理/岗位/到岗时间标签
- ✅ Footer 新增「教育背景」区块（请补充真实学校/专业/学历信息）
- ✅ Footer 新增「求职意向」区块（目标岗位/城市/行业/到岗时间）
- ✅ 三个核心产品（国家反诈中心App、互贷网理财、中数链）新增：
  - Highlights 标签（快速了解产品亮点）
  - Metrics 关键指标卡片（量化数据一目了然）
  - STAR 叙事（情境-任务-行动-成果）

### P1 — 决策逻辑
- ✅ 三个方案设计卡片各增加决策/选型理由：
  - 省级国反分布式：分布式 vs 集中式架构选择原因
  - 中数链：四方角色体系 + 自建链 vs 联盟链
  - 信生代+钱包小贷：三种方案对比（单App / 双App独立 / 双App+统一账户）

### P2 — 性能与适配
- ✅ 所有 img 标签添加 loading="lazy" 懒加载
- ✅ CSS 新增平板断点 @media (max-width:1024px)
- ✅ CSS 新增超小屏断点 @media (max-width:375px)
- ✅ 移动端 Hero 标签、导航栏、Filter 按钮自适应
- ✅ script.js 顶部添加占位图替换清单（标注所有待替换图片）
- ✅ Footer 响应式三栏→两栏→单栏

## 文件结构
```
portfolio-改进/
├── index.html            # 主页面（已改进）
├── style.css             # 样式表（已改进）
├── script.js             # 交互逻辑（弹窗/筛选/上传/产品数据）
├── prod-upload.js        # 产品图片上传模块（独立压缩+IndexedDB存储）
├── analytics.html        # 数据分析后台看板
├── analytics-tracker.js  # 埋点追踪脚本
├── images/               # 产品截图/Logo
└── CLAUDE.md             # 本文件
```

> **注意**：`index.html` 第 398 行引用了 `<script src="doc-db.js"></script>`，但该文件尚未创建——这是一个待处理的缺失依赖。

## 2026-06-26 更新日志

### 登录页改造（analytics.html）
- **设计**：左右分栏 → 单卡片融合布局，深紫→青渐变背景 + 几何装饰（浮动圆/环/光点/条纹/旋转大环）
- **背景**：纯白 `#fff` + 两个动态彩色光球（紫 `rgba(99,102,241,.22)` / 青 `rgba(6,182,212,.18)`，带 opacity 呼吸动画）+ 网格点阵
- **表单**：半透明玻璃拟态输入框，白色实底登录按钮，深色文字
- **眼睛按钮**：默认闭眼图标（密码隐藏），点击切换睁眼（密码可见），`svg { pointer-events: none }` 确保点击穿透到 button
- **布局**：卡片内容 `justify-content: center` 垂直居中，padding 40px
- **固定一屏**：`#auth-gate { height: 100vh; overflow: hidden }`，登录后 `body.overflow = ''` 恢复滚动
- **退出确认**：点击退出 → 弹窗 "确定要退出登录吗？" → 确认后 `localStorage.clear + location.reload()`

### 登录逻辑修复
- **独立脚本**：登录逻辑放在 auth-gate 之后的独立 `<script>` 标签中，不依赖 Supabase/Chart.js 加载
- **密码校验**：`evan2026` 纯文本回退 + 原始密码 SHA-256 哈希 `11a84cf94abddbcadeabb287252384213ed803b65c23b063c3b29a99c44cff96`
- **登录态**：`localStorage._ad_auth = '1'`，刷新不丢失
- **会话恢复**：页面加载时底部脚本检测 localStorage，已登录直接显示看板 + 调用 `initDashboard()`
- **暴露 API**：`window._initDashboard = initDashboard` 供独立脚本调用

### 仪表盘 UI 优化（analytics.html）
- **日期按钮**：`最近 7 天` → `近7天`，`最近 30 天` → `近30天`
- **日历/清除/退出按钮**：全部改为 SVG 图标（无文字），hover 显示 title tooltip
  - 日历：📅 日历图标
  - 清除：⚠️ 感叹号圆圈
  - 退出：🚪 门+箭头
- **日历弹窗**：移到 `<body>` 末尾，`position:fixed` 独立于父容器 backdrop-filter；右边缘与设备卡片右边缘对齐+2px；箭头改小圆形；日期格子改为圆形（30×30 border-radius:50%）；今天默认满色蓝圆选中态；有数据日期显示蓝点；无数据日期灰色不可点；去掉"有数据/无数据"图例
- **图表布局**：4 列一排（1024px 以下 2 列，640px 以下 1 列），卡片白色圆角 14px
- **图表尺寸**：折线图 130px，柱状图 110px，环形图 130px（max-width 130px）
- **图表配色**：统一柔和调色板（`#818CF8` / `#22D3EE` / `#34D399` / `#FBBF24`）
- **趋势图**：PV 渐变填充（`rgba(99,102,241,.15)`→透明）+ 小圆点 + 平滑曲线(tension .5) + 微弱网格线；UV 青实线无填充
- **停留时长柱状图**：四色圆角柱 + 右侧数值标签（datalabels anchor:end），Y轴标签不加粗
- **环形图（点击分布/设备分布）**：分段内直接显示白色 **名称+数值**（datalabels formatter），无图例无 tooltip；cutout 58%；段间距 3px
- **指标卡片字号**：标签 11px/600，数值 22px/700，变化提示 11px — 与图表标签统一
- **隐藏**：所有 chart.js 原生 legend，用 datalabels 或自定义方式展示数据

### 热力图修复（analytics.html）
- **容器**：`min-height: 200px` + `display: flex` 居中
- **Canvas**：`position: relative`（不再是 absolute）
- **无数据时**：自动生成 40 个随机坐标演示数据，确保总能看到热力图效果
- **删除**：`heatmap-loading` 加载元素，简化渲染流程

### 追踪器增强（analytics-tracker.js）
- **OS 详细检测**：Windows 10 / Windows 11 / Windows 8.1 / macOS 版本细分
- **架构检测**：64-bit / 32-bit（从 UA 中 Win64/WOW64 标识判断）
- **OS 字段**：组合为 `Windows 10 · 64-bit` 格式存到 sessions.os
- **Windows 设备信息**：品牌默认 `Unknown`（仅 Surface/ThinkPad/Dell/HP/ASUS/Acer 可从 UA 识别），型号同理
- **自定义设备标签**：`localStorage.setItem('_av_label', 'DESKTOP-E14E6HR')` 可覆盖 device_name；同时也支持 `_av_brand` 和 `_av_model`

### 已知限制
- 浏览器无法获取电脑主机名（NetBIOS name），需通过 localStorage 自定义
- 普通台式机组装机的品牌/型号 UA 中无标识，显示 `Unknown`
- 热力图需有 click 事件数据（在 index.html 点击模块后等 5 秒上报），否则使用演示数据
- Web Crypto API 在 `file://` 协议下可能受限，登录提供纯文本回退

## 2026-07-06 更新日志

### 全局优化（代码质量 + 无障碍 + 体验）
- **CSS 重复规则修复**：合并 `.exp-item strong/span/p` 重复定义（6条→3条），避免样式覆盖歧义
- **无障碍访问 (a11y)**：
  - 新增 `.skip-link` 跳过导航链接（Tab 键直达主内容）
  - 导航栏/筛选按钮/区域添加 ARIA 属性（`aria-label`、`aria-selected`、`aria-controls`、`role="region/tab/tablist"`）
  - 全局 `:focus-visible` 蓝色轮廓样式，键盘导航可感知
  - 卡片/列表项添加 `tabindex="0"` + `role="button"`，Enter/Space 键触发点击
  - 筛选按钮切换时动态更新 `aria-selected` 状态
- **图片加载失败处理**：新增 `imgFallback()` 全局函数 + `.img-fallback` CSS——加载失败显示图标+文字占位符，不再粗暴隐藏
- **返回顶部按钮**：从 Footer 底部隐藏 → 右下角悬浮固定，滚动 >400px 渐变显示，玻璃拟态风格
- **弹窗焦点陷阱**：Modal 打开时焦点锁定在弹窗内 Tab 循环，关闭后恢复焦点到触发元素；Esc 仅在 Modal 打开时生效
- **SEO/社交 Meta**：新增 `og:image`、`twitter:card`、`author`、`theme-color` 等标签

### 项目管理模块重写（段位提升）
- **卡1：「项目流程与标准建立」→「从0建立项目交付体系」**
  - 视角从"执行了什么流程"升级为"建立了什么组织能力"
  - 三步流程改为：标前评估（决策框架）→ 标准化交付（模板化SOP）→ 能力沉淀（脱离个人依赖）
  - 弹窗内容重写：增加三维标前评估决策框架、五阶段模块化交付体系设计逻辑、知识库沉淀与持续迭代机制
  - 量化锚点：交付周期缩短约30%、新人两周上手
- **卡2：「团队管理与组织协同」→「产品组织搭建与跨部门影响力」**
  - 视角从"管了多少人"升级为"如何设计组织和机制"
  - 指标改为：2家公司从零组建 / 3条业务线机制化运转 / 5+外部方管理
  - 弹窗内容重写：铁三角团队结构设计逻辑、基于商业价值的跨部门优先级排序机制、外部 Stakeholder 管理的方法论和具体案例
  - 叙事风格：从"做了什么"转为"为什么这样做 + 怎么做的 + 结果是什么"

## 2026-07-13 更新日志

### 弹窗系统重构
- **固定标题栏**：标题 + 关闭按钮悬浮固定在弹窗顶部，滚动时不消失
  - 新增 `.modal-header` 容器，`position: sticky; top: 0`
  - `.modal-x` 从 `position: absolute` 改为 flex 布局内 `flex-shrink: 0`
  - `openModal(titleHtml, bodyHtml)` 函数拆分标题/正文注入
  - 4 个弹窗入口全部适配（项目/产品/文档/设计作品）
- **滚动优化**：滚动条从 `.modal-box` 移到 `#modal-body`，仅正文区域滚动，标题栏始终可见
- **玻璃质感 (Design 弹窗专用)**：
  - `.modal-box.glass` + `.modal-box.glass .modal-header` 玻璃态样式
  - 通过 JS 动态添加/移除 `glass` class，其他模块不受影响
  - `blur(48px) saturate(200%)` + 四边内发光边缘光效
  - 默认弹窗保持白色背景，逐个模块按需启用

### 埃森哲设计作品弹窗
- **入口**：Footer 埃森哲条目末尾 `查看代表设计 →` 链接（`data-project="accenture-design"`）
- **弹窗内容**：
  - 标题「代表设计」+ 经历简述（固定标题栏）
  - 4 列网格展示 4 个项目：百威 ABI、永辉超市、达能水业、日本罗森
  - 每张卡片：Logo 区域（白底 + flexbox 居中 + 28px 内边距）+ 信息栏（项目名 · 终端类型）
  - 卡片玻璃质感：`blur(18px)` 半透明 + `::before` 对角强光 + `::after` 顶部光带
  - hover: 上浮 3px + 白色辉光 + `scale(1.03)`
- **Logo 文件**：`images/budweiser-logo.png`、`images/yonghui-logo.png`、`images/danone-logo.png`、`images/lawson-logo.png`（均为 PNG 透明背景）
- **图片上传**：
  - 每个卡片右上角上传按钮（hover 显示）
  - 上传后存入 localStorage（key: `design_img_0`~`design_img_3`），刷新不丢失
  - 封面始终显示品牌 Logo，Lightbox 仅展示已上传图片（不混入占位图）
  - 上传后自动出现删除按钮（红色垃圾桶图标），点击清除全部已上传图片
- **数据**：`designPortfolioData` 数组，存储在 `script.js`

### 文档撰写模块重构
- **分类重组**（5 类 → 全部更新）：
  - 调研类 → **调研分析** (`#00A3E0`)：市场调研/竞品分析/用户调研/可研报告
  - 需求类 → **产品规划** (`#00B853`)：PRD/SRS/产品路线图/RTM（新增「产品路线图」，删除「需求变更记录」）
  - 招投标类 → **招投标** (`#0055FF`)：标书/技术方案/商务应答/成本分析
  - 汇报类 → **项目汇报** (`#3B82F6`)：成果汇报/验收报告/复盘总结/数据分析报告（删除「周报/月报」，新增「复盘总结」）
  - 培训类 → **规范与培训** (`#7B3DFF`)：操作手册/部署手册/管理员指南/培训PPT
- **弹窗内容精简**：
  - 去掉绿色「文档合集」标签和标题左侧圆点
  - 每类 4 条文档，**两列网格**排版（`doc-grid-2col`），点击任意文档 → Lightbox 查看截图
  - 每个文档条目新增 `img` 字段（独立占位截图）

### 方案设计卡片 hover 优化
- 统一所有卡片（`.card`、`.doc-card`、`.doc-visual-card`）的 hover 效果
- 边框：1px 细线 `rgba(129,140,248,.5)`
- 光晕：`0 0 20px rgba(99,102,241,.12)` 紫色辉光
- 上浮：`translateY(-4px) !important`（覆盖 JS 内联样式）

### 其他细节优化
- 项目管理卡片矩形：`border-radius` 顶部两角改为直角（`0 0 8px 8px`），渐变线段完全贴合
- 「查看详情 →」底部渐变线段：border-radius 加大至 6px，两端圆润
- 文档卡片箭头：hover 时改为紫青渐变 `#6366F1 → #06B6D4`
- 多类型项目交付实践左边图标缩小至 16×16
- 弹窗标题紫色圆点已移除

## 2026-07-16 更新日志

### 产品图片上传模块重构（`prod-upload.js`）
- **独立模块**：将产品图片上传逻辑从 `script.js` 中抽取为独立的 `prod-upload.js`，便于维护和复用
- **图片压缩**：上传时使用 Canvas 进行压缩——最大宽度 1200px，JPEG 格式质量 0.7，大幅减少 localStorage/IndexedDB 存储占用
- **存储层**：使用 IndexedDB（数据库名 `ProdDB`，store `imgs`）替代 localStorage 存储大体积 base64 图片数据，解决 localStorage 5MB 上限问题
- **进度 UI**：环形进度条（`conic-gradient`）+ 百分比数字，上传完成后显示成功 toast
- **API 暴露**：`window._prodUpload(event, key)`、`window._prodGetImgs(key, callback)` 供 `script.js` 产品弹窗调用

### Storage 迁移（localStorage → IndexedDB）
- **产品图片**：`prod-upload.js` 使用 IndexedDB `ProdDB` 存储；`script.js` 中原有的 `ProdImagesDB` + localStorage 双写逻辑暂时保留以兼容旧数据
- **向后兼容**：`script.js` 的 `_prodGetImgs` 仍支持 localStorage 回退读取，确保迁移期间旧上传图片不会丢失

### 产品图片展示修复（刷新后图片丢失）
- **问题**：`index.html` 底部的内联清理脚本每次页面加载时删除所有 `prod_imgs_*` 的 localStorage 键，但产品弹窗只从 localStorage 读取图片列表，导致已上传图片刷新后消失
- **修复**：
  1. 删除 `index.html` 底部的两段 `prod_imgs_*` 清理脚本
  2. 产品弹窗点击时改为先调 `_prodDBLoad` 从 IndexedDB 读取，仅当 IndexedDB 无数据时才回退到 localStorage/sessionStorage
- **持久化路径**：上传 → `_prodUpload` 写入 localStorage + IndexedDB（`ProdImagesDB`）→ 刷新后弹窗从 IndexedDB 读取 → 图片不丢失

### 缺失文件
- **`doc-db.js`**：`index.html` 第 398 行引用了 `<script src="doc-db.js"></script>`，但该文件尚未创建——可能是为文档图片 IndexedDB 迁移预留的模块，目前文档图片仍走 `script.js` 内联的 localStorage 逻辑（`_docUp`/`_docDel`）

### 代表设计弹窗图片功能完善
- **`_designLoad(k, cb)`**（新增）：异步加载设计图片——IndexedDB 优先，无数据时回退 localStorage
- **`_du` 重写**：Canvas 压缩（1200px / JPEG 0.7）+ 环形进度条 + IndexedDB（`ProdImagesDB`）+ localStorage 双写
- **`_dd` 重写**：删除时同步清除 IndexedDB + localStorage，DOM 通过 `_refreshDesignCard` 统一更新
- **`_refreshDesignCard`**（新增）：卡片 DOM 更新复用函数——click handler / badge 张数 / 删除按钮统一管理
- **`_designGetImgs`**（新增）：同步 localStorage 读取器，供 lightbox 获取完整图片列表
- **弹窗异步加载**：打开弹窗时 4 个项目并行从 `_designLoad` 读取，全部加载完成后再渲染

### 已知问题
- `script.js` 和 `prod-upload.js` 各自维护独立的 IndexedDB 连接（`ProdImagesDB` vs `ProdDB`），存在重复初始化开销，后续可考虑统一为一个 DB
- `doc-db.js` 缺失，浏览器控制台会报 404 脚本加载错误（不影响功能，文档图片走的是 `script.js` 内联逻辑）
- ~~`index.html` 清理脚本删除 `prod_imgs_*` 导致刷新后图片丢失~~（已修复：弹窗改为 IndexedDB 优先读取）

## 待用户自行处理的事项
1. **补充教育信息**：index.html 中搜索「请补充学校名称」，替换为真实信息
2. **替换占位图**：script.js 顶部的注释清单列出了所有 placehold.co 占位图
3. **确认求职意向**：目标岗位/城市/行业/到岗时间如有不符请修改
4. **压缩图片**：PNG → WebP，单张控制在 200KB 以内
5. **自定义设备名**：F12 控制台执行 `localStorage.setItem('_av_label', '你的电脑名')`

## 原始版 vs 改进版对照
| 维度 | 原始版 | 改进版 |
|------|--------|--------|
| SEO | 无 meta description | 完整 SEO 标签 |
| Hero 定位 | 行业+技能泛泛描述 | 精确经验年限+管理规模+地理+岗位 |
| 量化数据 | 仅反诈App有1条 | 3个核心产品各有 metrics 卡片 |
| 叙事结构 | 描述性 | 3个核心产品 STAR 结构 |
| 决策逻辑 | 只写做了什么 | 增加了为什么这么做/方案对比 |
| 教育信息 | 缺失 | 有占位，待填写 |
| 求职意向 | 缺失 | 有占位，待填写 |
| 响应式 | 仅768px一个断点 | 1024/768/375 三个断点 |
| 图片加载 | 无懒加载 | loading="lazy" |
| 占位图 | 无提示 | 文件顶部有完整替换清单 |
| 数据分析 | 无 | 埋点追踪 + Supabase后台 + 热力图 |

## 2026-07-17 更新日志

### 文档撰写模块 — 图片上传/查看/删除功能重构
- **`_docUp` 重写**：新增 Canvas 压缩（1200px / JPEG 0.7）+ 环形进度条 + IndexedDB（`ProdImagesDB`）+ localStorage 双写
- **`_docDel` 重写**：删除时同步清除 IndexedDB + localStorage，通过 `_refreshDocCard` 统一刷新 DOM
- **`_refreshDocCard`**（新增）：文档卡片 DOM 统一更新函数——cursor / 张数 badge / 删除按钮集中管理，不再用内联 DOM 操作
- **`_docLoad`**（新增）：异步加载文档图片——`_docImgs` 缓存 → localStorage → IndexedDB → 1.2s 超时回退
- **弹窗异步加载**：打开文档弹窗时 4 个文档并行从 `_docLoad` 读取，全部加载完再渲染
- **删除按钮图标**：从 `×` 文字换成和代表设计一致的 SVG 垃圾桶图标
- **封面固定显示**：上传图片后不再替换封面，始终保持封面背景 + 文档名称居中，仅显示张数角标

### 项目管理弹窗 — 内容与展现形式重构
- **标题对齐**：标题注入 `modalHeaderContent`，与关闭按钮水平对齐，去除"项目管理"标签
- **数据重构**：`mgmt` 和 `team` 数据结构从 `sections` 改为 `steps`，标题与卡片对应
  - mgmt：构建交付模型 → 沉淀标准体系 → 驱动持续改进
  - team：搭建产品团队 → 推动责任下沉 → 统筹多方协同
- **展现形式**：纵向排列，每条左侧彩色竖线 + 标题行 + 精简描述，浅灰底背景矩形
- **竖线渐变**：紫→青→绿（`#6366F1 → #06B6D4 → #10B981`），宽 2.5px，与卡片顶部渐变条一致
- **字号优化**：标题 13px、标签 10px、描述 12px

### 方案设计弹窗 — 重构
- **标题对齐**：标题注入 `modalHeaderContent`，与关闭按钮对齐，去除"方案设计"标签，左侧加产品 logo
- **弹窗标题与卡片对应**：省级国反分布式、中数链 + 国版数创、信生代 + 钱包小贷
- **方案展示**："方案资料" → "方案展示"，支持图片和 PDF/Word 文件上传
- **文件上传**（`_slnUpload`）：图片 Canvas 压缩，PDF/Word 读为 base64，存储格式 `{type:'image'|'pdf'|'word', data:'...', name:'...'}`
- **存储键**：`sln_file_<key>`，通过 `_slnLoad` 统一从 IndexedDB → localStorage 读取
- **文件缩略图**：PDF/Word 显示对应图标 + 文件名，背景用 `sln-cover-bg.png`（**待替换为背景4.png**）
- **PDF/Word 预览**：全屏 lightbox，iframe 加载（`#toolbar=0`），三层水印（左上/居中/右下，"相关文件  仅供查看"），禁止右键/选择/快捷键复制
- **hover 效果**：`translateY(-5px)` 上浮，无阴影无缩放

### 文件权限控制系统
- **触发**：底部版权文字中连续点击"Evan"5 次（2 秒内）
- **弹窗**：状态文字 + 滑动开关 + 密码输入框（带眼睛图标切换显隐）+ 纯圆角确认按钮
- **密码**：手机号 `18616742788`，验证通过后 toast 提示
- **锁定状态**：`edit-locked` class 控制，隐藏所有上传/删除按钮（文档撰写、代表设计、产品展示、方案展示）
- **持久化**：localStorage `_perm_edit_enabled`，刷新不丢失

### 卡片 hover 效果统一
- **文档撰写卡片**：`translateY(-5px)`，无阴影、无缩放、无边框
- **代表设计卡片**：`translateY(-5px)`，无阴影、无缩放
- **方案展示文件**：`translateY(-5px)`，无阴影、无缩放
- **卡片容器 padding**：`.design-gallery` 加 `padding:8px 0 0 0` 防止上浮裁切

### 其他细节
- **招投标 → 招标投标**：外面卡片和弹窗中统一改名
- **弹窗尺寸**：`max-width` 860px → 960px
- **水印**：预览弹窗水印文字"相关文件  仅供查看"

---

## 数据分析系统部署指南

### 文件结构
```
portfolio-改进/
├── analytics-tracker.js   # 埋点脚本（已创建）
├── analytics.html         # 后台看板（已创建，独立访问）
├── index.html             # 主页面（已接入埋点）
└── ...
```

### 一、Supabase 部署（一次性，约 5 分钟）

#### 1. 注册并创建项目
- 打开 https://supabase.com 注册（免费，可用 GitHub 登录）
- 创建新项目 `portfolio-analytics`，选择离中国最近的区域（如 Singapore）
- 记录数据库密码

#### 2. 执行建表 SQL

打开 Supabase > SQL Editor，粘贴以下所有 SQL 并执行：

```sql
-- 会话表
CREATE TABLE sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      TEXT NOT NULL UNIQUE,
    visitor_id      TEXT NOT NULL,
    start_time      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time        TIMESTAMPTZ,
    duration_seconds INTEGER,
    device_type     TEXT,
    os              TEXT,
    browser         TEXT,
    screen_width    INTEGER,
    screen_height   INTEGER,
    viewport_width  INTEGER,
    viewport_height INTEGER,
    language        TEXT,
    timezone        TEXT,
    referrer        TEXT,
    page_count      INTEGER DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_visitor ON sessions(visitor_id);
CREATE INDEX idx_sessions_start ON sessions(start_time);

-- 页面浏览表
CREATE TABLE pageviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      TEXT NOT NULL,
    page_url        TEXT NOT NULL,
    page_title      TEXT,
    referrer        TEXT,
    load_time_ms    INTEGER,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pageviews_timestamp ON pageviews(timestamp);

-- 事件表（点击、区域进入/离开、滚动深度）
CREATE TABLE events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    element_id      TEXT,
    element_class   TEXT,
    element_text    TEXT,
    element_tag     TEXT,
    section         TEXT,
    module          TEXT,
    page_x          INTEGER,
    page_y          INTEGER,
    viewport_w      INTEGER,
    viewport_h      INTEGER,
    scroll_y        INTEGER,
    metadata        JSONB,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_section ON events(section);
CREATE INDEX idx_events_timestamp ON events(timestamp);

-- 每日聚合表
CREATE TABLE daily_summary (
    date                DATE PRIMARY KEY,
    pageviews           INTEGER DEFAULT 0,
    unique_visitors     INTEGER DEFAULT 0,
    total_sessions      INTEGER DEFAULT 0,
    avg_duration_sec    REAL DEFAULT 0,
    total_clicks        INTEGER DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 启用 RLS
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pageviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summary ENABLE ROW LEVEL SECURITY;

---

## 2026-07-22 更新日志

### 图片资源优化
- **重复文件清理**：删除 11 个重复/未引用文件，节省 ~4.1 MB
  - `gjfz-01.svg/gjfz-02.svg`（未引用）、`zsliam-icon.ico/zsliam-logo-icon.ico/zsliam-logo-icon.png`（重复）、`doc-icon.png/word-icon.png`→`doc-type-word.png`、`doc-icon3.png`→`doc-type-ppt.png`、`pdf-icon.png`→`doc-type-pdf.png`、`danone-logo.jpg/reference-1.png`（未引用）
- **图片压缩**：19 个大图 resize 压缩（gjfz-* 1888KB→680KB、doc-type-* ~2000KB→34KB、sjgf-* ~1100KB→425KB、Logo 文件 90-267KB→25-35KB），项目总大小从 ~26MB 降至 ~6.3MB
- **占位图替换**：38 个 `placehold.co` URL 全部替换为本地 SVG data URI，消除外部图片请求

### 产品弹窗优化（代表产品→产品选集→回归代表产品）
- **标题/描述/标签可编辑**：产品弹窗中描述文字（长按 textarea）、标签（长按编辑/新增/删除）全部支持长按修改，存储到 localStorage
- **标签颜色统一**：每个产品的标签颜色与所属分类一致（反诈蓝、区块链青、金融绿、支付紫、电商橙）
- **+ 添加按钮样式**：统一为实线边框、不加粗，hover 变色
- **间距统一**：标签→描述→产品展示间距统一为 10-14px
- **标题类型标签移除**：弹窗标题右侧的分类标签（如"反电信网络诈骗类"）已去掉
- **产品 Logo 支持**：多个产品新增 logo（熊猫买手、信生代、互贷网理财、天天速贷、金享会、国版数创、全民反诈、BITKER），支持 `logoSize`/`logoBg` 属性控制显示

### 方案设计模块
- **卡片标题/标签/描述可编辑**：方案设计三张卡片的主标题、标签（分三段独立编辑，· 固定分隔）、描述文字全部支持长按编辑
- **弹窗描述/小节可编辑**：弹窗中描述文字、小节标题和内容支持长按编辑，可新增/删除小节，存储到 `localStorage._custom_sln_data`
- **+ 添加按钮**："+ 添加小节"→"+ 添加"，样式与上传按钮统一
- **小节间距**：从 20px 缩小到 12px
- **小标题字号**：与"方案展示"统一为 14px
- **标题与内容间距**：从 8px 缩小到 4px
- **Logo 放大**：中数链 logo 在弹窗中从 18px→22px，卡片中从 20px→24px

### 文档撰写模块
- **分类名恢复**：先改为"需求定义"后恢复"产品规划"
- **弹窗描述可编辑**：主标题下方描述文字支持长按编辑，存储到 `_custom_doc_descs`

### 代表设计模块
- **编辑方式变更**：从按钮点击改为长按编辑（与文档卡片一致）
- **弹窗描述可编辑**：主标题下方描述文字支持长按编辑，存储到 `_design_desc`
- **编辑态点击拦截**：`.dg-info-edit` 容器阻止事件冒泡，防止编辑时误触预览

### 项目管理模块
- **卡片标题/描述可编辑**：两张管理卡片标题和描述支持长按编辑
- **弹窗标题同步**：卡片标题修改后自动同步到弹窗主标题

### 全局编辑能力
- **板块标题可编辑**：四个板块（代表产品、方案设计、文档撰写、项目管理）的 h2 标题支持长按编辑，同步更新导航栏 tab 和筛选按钮，存储到 `_custom_sec_titles`
- **光标统一**：所有可编辑区域统一显示 `pointer`（手指）光标
- **编辑态点击保护**：所有卡片点击处理器加上 `card.querySelector('input, textarea')` 检查，编辑状态下不触发弹窗

### 文件权限 → 管理权限
- 权限弹窗标题从"文件权限"改为"管理权限"
- 所有编辑功能（添加/修改/删除/上传）纳入管理权限控制

### 方案展示文件支持
- **PPT 格式支持**：上传 accept 新增 `.ppt/.pptx`，缩略图/预览/存储全链路支持
- **PDF/Word/PPT 预览重构**：
  - PDF：改回浏览器原生 iframe 预览（Blob URL），快速清晰
  - Word/PPT：因浏览器无法内联渲染 Office 格式，改为下载卡片（大图标+文件名+下载按钮）
- **PDF 预览底部滚动条隐藏**：iframe 高度 `calc(100% + 17px)` + `overflow:hidden` 裁掉底部滚动条
- **IndexedDB 清理修复**：遗留的 `sln_file_*` 键清理代码每次页面加载都执行，已加 `_db_cleanup_v1` 标志限制为仅一次
- **PPT 存储修复**：PPT 文件上传后同样保存到 IndexedDB + sessionStorage，刷新不丢失

### 导航栏
- **邮箱/电话位置**：调整后恢复为邮箱在左、电话在右
- **滚动行为恢复**：导航 tab 切换逻辑恢复为基于 hero 的 IntersectionObserver 方案

### 设计作品 logo 更新
- 百威、永辉、达能、罗森 logo 已更新到 images/ 文件夹

### 已知待处理
- 多个产品仍使用 SVG 占位图，待替换真实截图
- 教育背景和求职意向仍未填写
- Word (.docx/.doc) 和 PPT 文档无法在弹窗内预览，浏览器不支持内联渲染 Office 格式
- PDF 滚动条箭头由浏览器 PDF 插件渲染，页面 CSS 无法控制
- `script.js` 和 `prod-upload.js` 仍各自维护独立的 IndexedDB 连接，可进一步统一
- `gjfz-01.png` 至 `gjfz-05.png` 五个文件完全相同（均为占位图），待替换为真实截图

-- 允许匿名 INSERT（埋点上报）
CREATE POLICY "allow_insert_sessions" ON sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "allow_insert_pageviews" ON pageviews FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "allow_insert_events" ON events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "allow_insert_daily" ON daily_summary FOR INSERT TO anon WITH CHECK (true);

-- 允许匿名 SELECT（后台看板查询）
CREATE POLICY "allow_select_sessions" ON sessions FOR SELECT TO anon USING (true);
CREATE POLICY "allow_select_pageviews" ON pageviews FOR SELECT TO anon USING (true);
CREATE POLICY "allow_select_events" ON events FOR SELECT TO anon USING (true);
CREATE POLICY "allow_select_daily" ON daily_summary FOR SELECT TO anon USING (true);

-- 允许匿名 UPDATE（埋点更新 session 结束时间）
CREATE POLICY "allow_update_sessions" ON sessions FOR UPDATE TO anon USING (true);
CREATE POLICY "allow_update_daily" ON daily_summary FOR UPDATE TO anon USING (true);
```

#### 3. 获取 API 密钥
- Supabase 左侧菜单 > Settings > API
- 复制 **Project URL**（如 `https://abc123.supabase.co`）
- 复制 **anon public key**（以 `eyJ...` 开头）

#### 4. 填入密钥

修改 `analytics-tracker.js` 第 14-15 行：
```js
supabaseUrl: 'https://abc123.supabase.co',  // 替换为你的 Project URL
supabaseKey: 'eyJhbGciOi...',               // 替换为你的 anon key
```

修改 `analytics.html` 搜索 `SUPABASE_URL` 和 `SUPABASE_KEY`，同样替换。

#### 5. 设置后台密码

`analytics.html` 首次访问时，输入你想设置的密码，页面会提示生成 SHA-256 哈希。按提示将哈希值填到 `PASSWORD_HASH` 变量中。

---

### 二、访问后台

部署后通过 `analytics.html` 访问后台看板，输入密码即可查看所有统计。

### 三、验证埋点是否生效

1. 打开 `index.html`，点击几个模块
2. 等待 5 秒（让事件批量上报）
3. 打开 Supabase > Table Editor > events 表，确认有数据写入
4. 打开 `analytics.html` 查看后台

---

## 2026-07-20 更新日志

### 访问密码门
- **密码门**：页面加载时显示全屏玻璃拟态密码门，输入正确密码（`evan2026`）方可查看内容
- **样式**：与主页面风格统一的玻璃拟态卡片，蓝青渐变背景光晕缓慢浮动
- **安全策略**：sessionStorage 存储登录态（关闭浏览器即失效），SHA-256 哈希校验 + 纯文本回退
- **防暴力破解**：连续 3 次错误密码后冷却 30 秒
- **零 FOUC**：校验脚本内联在密码门 HTML 之后，已登录页面无闪烁

### 密码小人动态图标
- **形象**：SVG 绘制的紫蓝色小人（头部 + 身体 + 眼白 + 眼珠 + 嘴），独立头部分组
- **眼珠追踪**：requestAnimationFrame 驱动，眼珠带 lerp 惯性缓动跟随鼠标方向（水平 ±0.9px，垂直 ±1.4px）
- **头部微转**：头部随鼠标水平方向微转 ±10°，惯性比眼珠更大（lerp 0.06），实现自然转头效果
- **眨眼动画**：clip-path inset 上下往中间闭合，每 5 秒眨一次，两眼同步
- **呼吸浮动**：整身 3s 周期微小上下浮动 4px
- **墨镜掉落**：点击密码输入框或眼睛按钮时，墨镜从上方掉落戴在眼睛上（弹性缓动），眼白+眼珠淡出
- **眼部细节**：眼白为正圆 r=4.5，眼珠 r=1.6，纯色无腮红无眉毛，保持中性专业感
- **嘴巴**：细弧线微笑，深色半透明，低调含蓄
- **背景装饰**：小人脚下椭圆光斑 + 两个独立伪元素光球（transform 硬件加速漂移，丝滑不闪）

### 按钮细节
- **眼睛按钮图标**：闭眼改为月牙弧线 + 三根睫毛（去掉了斜杠）；睁眼保持眼形轮廓 + 瞳孔
- **输入框聚焦**：蓝色实线描边 + 3px 淡蓝阴影，hover 无效果，仅点击触发

### 文档撰写模块
- **卡片顺序调整**：按项目生命周期重新排列——01 调研分析 → 02 产品规划 → 03 招标投标 → 04 项目汇报 → 05 交付规范
- **卡片名称微调**：招标投标保持原名（四字对齐）、规范与培训 → 交付规范
- **编号颜色同步**：CSS nth-child 颜色与卡片新顺序对齐

### 文档弹窗
- **卡片阴影移除**：`.doc-file-preview` 的 box-shadow 已删除（之前因 CSS 语法错误孤立的属性）
- **hover 效果**：鼠标移入无变化，点击输入框后才出现蓝色描边

### Bug 修复
- **doc-db.js 缺失**：创建统一 IndexedDB 连接模块（`_docDB`），消除控制台 404 错误
- **CSS 语法错误**：style.css 第 987-991 行孤立 box-shadow 属性修复，合并回 `.doc-file-preview`
- **产品图片刷新丢失**：弹窗改为 IndexedDB 优先读取，上传文件持久化不过期
- **分析后台登录**：密码校验逻辑独立于 Supabase/Chart.js 加载，file:// 协议下纯文本回退

## 2026-07-21 更新日志

### 文档类型图标 — 弹窗中补全默认图标
- **问题**：文档弹窗中，产品规划、项目汇报、交付规范三个类别的条目没有类型图标（`docData` 中缺少 `icon` 字段）
- **修复**：给全部 20 个条目补充 `icon` 字段，按文档类型分配对应图标（PRD→Word、路线图→Image、RTM→Excel 等）
- **缓存破坏**：新增 `_iconVer = '?v=3'` 统一版本号，`_getDocTypeIcon()` 和 `docData` 所有图标路径追加该参数，更新图标文件后只需改一处

### 弹窗文件展示 — 逻辑修复
- **`openLightbox` 空数组 bug**：`[] || [src]` 在 JS 中 `[]` 为 truthy，回退永不触发。改为 `(Array.isArray(imgs) && imgs.length) ? imgs : [src]`
- **产品弹窗图片删除**：`_prodDelImg` 原只从 localStorage 读数据，改为 `_prodDBLoad`（IndexedDB 优先）和弹窗展示用同一数据源
- **方案文件加载崩溃**：`_slnLoad` 中 `JSON.parse(r)` 无 try-catch，数据损坏时抛异常导致回调永不执行、删除和预览全部静默失败。改为 try-catch + `done` 防重复回调 + 2 秒超时保底
- **`_slnGetImgs` 加强**：增加 sessionStorage 回退，空数组时返回默认截图而非 `[]`

### 弹窗默认行为 — 方案展示 & 产品展示
- **方案展示**：未上传时不展示默认 `d.imgs` 图片，仅显示上传按钮。`sln-scroll-*` 容器始终创建（供 `_slnFileRebuild` 找到），`display:none` 隐藏
- **产品展示**：同上，去掉 `pd.imgs` 默认回退，无上传时仅显示上传按钮
- **存储策略**：产品图片（`prod_imgs_*`）和方案文件（`sln_file_*`/`sln_img_*`）全部改用 **sessionStorage** 替代 localStorage，关浏览器后自动清除
- **IndexedDB 清理**：页面加载时自动清除六组旧的方案文件 IndexedDB 键（`sln_file_arch/summary/xinsheng`、`sln_img_arch/summary/xinsheng`），防止旧数据残留导致默认展示

### 缩略图 hover 裁切修复
- **问题**：`overflow-x:auto` 导致 `overflow-y` 隐式变为 `auto`（CSS 规范），缩略图 `translateY(-5px)` 上浮时顶部被裁切
- **修复**：方案展示和产品展示的 `img-scroll` 容器添加 `padding:8px 0`，给上浮留出空间

### Word 文档预览（未完成）
- 浏览器无法在 iframe 中内联渲染 Word 文档，`data:` URI 会触发自动下载
- 尝试 mammoth.js（CDN → 本地）均导致页面脚本崩溃，原因未定位
- 最终保持 iframe 方案（与 PDF 预览一致），Word 文档预览暂不支持

### 已知问题
- `script.js` 和 `prod-upload.js` 仍各自维护独立的 IndexedDB 连接，可进一步统一
- 多个产品仍使用 placehold.co 占位图，待替换真实截图
- 教育背景和求职意向仍未填写
- Word (.docx/.doc) 文档无法在弹窗内预览，浏览器不支持内联渲染 Word 格式
- 方案设计弹窗中 `summary`（中数链）和 `xinsheng`（信生代）的 `d.imgs` 默认截图文件不存在
