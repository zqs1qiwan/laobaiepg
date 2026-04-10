/**
 * LaobaiEPG 管理页面 HTML
 * 内嵌在 Worker 中，通过根路径 / 提供服务
 */

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LaobaiEPG 管理面板</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f172a;--surface:#1e293b;--surface2:#263348;--border:#334155;
  --text:#e2e8f0;--muted:#64748b;--accent:#3b82f6;--accent2:#60a5fa;
  --green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--purple:#a855f7;
  --group-cctv:#3b82f6;--group-weishi:#8b5cf6;--group-hktw:#ec4899;
  --group-local:#f59e0b;--group-paid:#10b981;--group-sat:#06b6d4;--group-other:#64748b;
}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;min-height:100vh}
a{color:var(--accent2);text-decoration:none}
a:hover{text-decoration:underline}

/* ── Header ── */
.header{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 24px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:100}
.header-logo{font-size:18px;font-weight:700;color:var(--accent)}
.header-badge{background:var(--accent);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.header-url{margin-left:auto;color:var(--muted);font-size:12px;font-family:monospace}

/* ── Tabs ── */
.tabs{display:flex;gap:2px;padding:0 24px;background:var(--surface);border-bottom:1px solid var(--border)}
.tab{padding:10px 18px;cursor:pointer;color:var(--muted);font-size:13px;font-weight:500;border:none;background:none;border-bottom:2px solid transparent;transition:all .15s}
.tab:hover{color:var(--text)}
.tab.active{color:var(--accent2);border-bottom-color:var(--accent2)}
.tab-panel{display:none;padding:24px;max-width:1400px;margin:0 auto}
.tab-panel.active{display:block}

/* ── Stats ── */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
.stat-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px}
.stat-value{font-size:28px;font-weight:700;color:var(--accent)}
.stat-label{color:var(--muted);font-size:12px;margin-top:4px}
.progress-wrap{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:20px}
.progress-label{display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px;color:var(--muted)}
.progress-bar{height:8px;background:var(--border);border-radius:4px;overflow:hidden}
.progress-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:4px;transition:width .6s ease}

/* ── EPG URL Box ── */
.url-box{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:18px;margin-bottom:20px}
.url-box h3{font-size:14px;font-weight:600;margin-bottom:14px;color:var(--text)}
.url-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.url-row:last-child{margin-bottom:0}
.url-label{color:var(--muted);font-size:12px;width:90px;flex-shrink:0}
.url-value{font-family:monospace;font-size:12px;color:var(--accent2);background:var(--bg);padding:5px 10px;border-radius:4px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.copy-btn{padding:4px 10px;font-size:11px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:4px;cursor:pointer;white-space:nowrap;transition:.15s}
.copy-btn:hover{border-color:var(--accent);color:var(--accent)}
.copy-btn.copied{background:var(--green);border-color:var(--green);color:#fff}

/* ── Status Table ── */
.status-box{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:18px;margin-bottom:20px}
.status-box h3{font-size:14px;font-weight:600;margin-bottom:14px}
.status-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)}
.status-row:last-child{border-bottom:none}
.status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.status-dot.ok{background:var(--green)}
.status-dot.err{background:var(--red)}
.status-dot.loading{background:var(--yellow);animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.status-filename{font-family:monospace;font-size:13px;flex:1}
.status-meta{color:var(--muted);font-size:12px}

/* ── Channel List ── */
.list-controls{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.search-input{background:var(--surface);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:13px;flex:1;min-width:200px;max-width:320px}
.search-input:focus{outline:none;border-color:var(--accent)}
.filter-btns{display:flex;gap:4px;flex-wrap:wrap}
.filter-btn{padding:5px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--muted);transition:.15s}
.filter-btn:hover{color:var(--text)}
.filter-btn.active{background:var(--accent);border-color:var(--accent);color:#fff}
.ch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
.ch-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;cursor:pointer;transition:.15s;user-select:none}
.ch-card:hover{border-color:var(--accent);background:var(--surface2)}
.ch-card.has-epg{}
.ch-card.no-epg{border-color:rgba(239,68,68,.3)}
.ch-header{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.ch-logo{width:40px;height:40px;border-radius:6px;object-fit:contain;background:var(--bg);flex-shrink:0;border:1px solid var(--border)}
.ch-logo-fallback{width:40px;height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0;text-align:center;line-height:1.2;padding:2px}
.ch-title{flex:1;min-width:0}
.ch-name{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ch-group-tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:3px;margin-top:2px;font-weight:500;color:#fff}
.ch-id{font-family:monospace;font-size:11px;color:var(--muted);margin-bottom:6px}
.ch-source{font-size:11px;color:var(--muted);margin-bottom:6px;display:flex;align-items:center;gap:4px}
.source-badge{font-size:10px;padding:1px 5px;border-radius:3px;background:var(--surface2);border:1px solid var(--border);font-family:monospace}
.ch-epg-status{display:flex;align-items:center;gap:5px;font-size:12px;margin-bottom:6px}
.ch-epg-status.ok{color:var(--green)}
.ch-epg-status.none{color:var(--red)}
.ch-aliases{display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
.ch-card.expanded .ch-aliases{display:block}
.alias-label{font-size:11px;color:var(--muted);margin-bottom:5px}
.alias-tags{display:flex;flex-wrap:wrap;gap:4px}
.alias-tag{background:var(--bg);border:1px solid var(--border);color:var(--muted);padding:2px 7px;border-radius:3px;font-size:11px}

/* ── Match Test ── */
.match-box{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:16px}
.match-box h3{font-size:14px;font-weight:600;margin-bottom:14px}
.match-input-row{display:flex;gap:8px}
.match-input{background:var(--bg);border:1px solid var(--border);color:var(--text);padding:8px 12px;border-radius:6px;font-size:13px;flex:1}
.match-input:focus{outline:none;border-color:var(--accent)}
.match-btn{padding:8px 16px;background:var(--accent);border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;white-space:nowrap}
.match-btn:hover{opacity:.85}
.match-result{margin-top:14px;padding:12px;border-radius:6px;font-size:13px}
.match-result.ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:var(--green)}
.match-result.fail{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--red)}
.match-result.loading{background:var(--surface2);border:1px solid var(--border);color:var(--muted)}
.match-detail{margin-top:8px;font-family:monospace;font-size:12px;color:var(--text)}
.batch-textarea{width:100%;height:130px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:10px;border-radius:6px;font-family:monospace;font-size:13px;resize:vertical;margin-bottom:10px}
.batch-textarea:focus{outline:none;border-color:var(--accent)}
.batch-table{width:100%;border-collapse:collapse;font-size:13px;margin-top:14px}
.batch-table th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);color:var(--muted);font-weight:500;font-size:12px}
.batch-table td{padding:7px 10px;border-bottom:1px solid var(--border)}
.batch-table tr:last-child td{border-bottom:none}
.ok-text{color:var(--green)}
.fail-text{color:var(--red)}

/* ── Guide ── */
.guide-section{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:16px}
.guide-section h3{font-size:15px;font-weight:600;margin-bottom:12px;color:var(--accent2)}
.guide-section p{color:var(--muted);line-height:1.7;margin-bottom:10px}
.guide-section p:last-child{margin-bottom:0}
.code-block{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:12px;font-family:monospace;font-size:12px;line-height:1.6;overflow-x:auto;margin:10px 0;color:var(--accent2)}

/* ── Empty / Loading ── */
.loading-text{text-align:center;color:var(--muted);padding:40px;font-size:13px}
.empty-text{text-align:center;color:var(--muted);padding:30px;font-size:13px}
</style>
</head>
<body>

<div class="header">
  <span class="header-logo">LaobaiEPG</span>
  <span class="header-badge">管理面板</span>
  <span class="header-url" id="workerHost"></span>
</div>

<div class="tabs">
  <button class="tab active" onclick="switchTab('status')">状态总览</button>
  <button class="tab" onclick="switchTab('channels')">频道列表</button>
  <button class="tab" onclick="switchTab('match')">匹配测试</button>
  <button class="tab" onclick="switchTab('guide')">使用指南</button>
</div>

<!-- ═══ TAB: 状态总览 ═══ -->
<div class="tab-panel active" id="tab-status">

  <div class="stats" id="statsCards">
    <div class="stat-card"><div class="stat-value" id="stat-total"><div class="loading-text">…</div></div><div class="stat-label">总频道数</div></div>
    <div class="stat-card"><div class="stat-value" id="stat-hasepg">…</div><div class="stat-label">有节目单</div></div>
    <div class="stat-card"><div class="stat-value" id="stat-rate">…</div><div class="stat-label">覆盖率</div></div>
    <div class="stat-card"><div class="stat-value" id="stat-updated" style="font-size:16px;padding-top:4px">…</div><div class="stat-label">最后更新（UTC）</div></div>
  </div>

  <div class="progress-wrap">
    <div class="progress-label">
      <span>覆盖率</span>
      <span id="progress-text">加载中…</span>
    </div>
    <div class="progress-bar"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
  </div>

  <div class="url-box">
    <h3>EPG 接入地址</h3>
    <div class="url-row">
      <span class="url-label">完整节目单</span>
      <span class="url-value" id="url-full" onclick="copyUrl('url-full')"></span>
      <button class="copy-btn" id="copy-full" onclick="copyUrl('url-full')">复制</button>
    </div>
    <div class="url-row">
      <span class="url-label">压缩版(推荐)</span>
      <span class="url-value" id="url-gz" onclick="copyUrl('url-gz')"></span>
      <button class="copy-btn" id="copy-gz" onclick="copyUrl('url-gz')">复制</button>
    </div>
    <div class="url-row">
      <span class="url-label">大陆频道</span>
      <span class="url-value" id="url-ml" onclick="copyUrl('url-ml')"></span>
      <button class="copy-btn" id="copy-ml" onclick="copyUrl('url-ml')">复制</button>
    </div>
    <div class="url-row">
      <span class="url-label">港台频道</span>
      <span class="url-value" id="url-hktw" onclick="copyUrl('url-hktw')"></span>
      <button class="copy-btn" id="copy-hktw" onclick="copyUrl('url-hktw')">复制</button>
    </div>
  </div>

  <div class="status-box">
    <h3>节目单文件状态</h3>
    <div id="statusRows"><div class="loading-text">检查中…</div></div>
  </div>

</div>

<!-- ═══ TAB: 频道列表 ═══ -->
<div class="tab-panel" id="tab-channels">
  <div class="list-controls">
    <input class="search-input" type="text" id="searchInput" placeholder="搜索频道名、ID 或别名…" oninput="filterChannels()">
    <div class="filter-btns" id="groupFilters"></div>
  </div>
  <div id="channelGrid" class="ch-grid"><div class="loading-text">加载频道列表…</div></div>
</div>

<!-- ═══ TAB: 匹配测试 ═══ -->
<div class="tab-panel" id="tab-match">

  <div class="match-box">
    <h3>单频道测试</h3>
    <p style="color:var(--muted);font-size:12px;margin-bottom:12px">输入你 M3U 播放列表中的 tvg-name，测试能否匹配到节目单</p>
    <div class="match-input-row">
      <input class="match-input" type="text" id="matchInput" placeholder="例如：浙江卫视4K、翡翠台、CCTV1" onkeydown="if(event.key==='Enter')testMatch()">
      <button class="match-btn" onclick="testMatch()">测试匹配</button>
    </div>
    <div id="matchResult" style="display:none" class="match-result"></div>
  </div>

  <div class="match-box">
    <h3>批量测试</h3>
    <p style="color:var(--muted);font-size:12px;margin-bottom:12px">粘贴 M3U 频道名，每行一个，批量检查匹配情况</p>
    <textarea class="batch-textarea" id="batchInput" placeholder="浙江卫视4K&#10;CCTV1&#10;翡翠台&#10;睛彩竞技&#10;北京卫视"></textarea>
    <button class="match-btn" onclick="batchTest()">批量测试</button>
    <div id="batchResult" style="display:none">
      <table class="batch-table">
        <thead><tr><th>输入频道名</th><th>匹配到的频道</th><th>状态</th></tr></thead>
        <tbody id="batchBody"></tbody>
      </table>
    </div>
  </div>

</div>

<!-- ═══ TAB: 使用指南 ═══ -->
<div class="tab-panel" id="tab-guide">

  <div class="guide-section">
    <h3>在 IPTV 播放器中配置</h3>
    <p>在 TiviMate、Kodi、Perfect Player 等播放器的 EPG 设置中，填入以下地址：</p>
    <div class="code-block" id="guide-epg-url">加载中…</div>
    <p>播放器会自动根据播放列表中的 <code style="background:var(--bg);padding:1px 4px;border-radius:3px">tvg-name</code> 匹配到对应频道的节目单。</p>
  </div>

  <div class="guide-section">
    <h3>别名匹配机制</h3>
    <p>每个频道可以配置多个别名，系统会自动匹配。例如播放列表中写的是 <code style="background:var(--bg);padding:1px 4px;border-radius:3px">浙江卫视4K</code>，会自动匹配到<strong>浙江卫视</strong>的节目单。</p>
    <p>匹配规则：精确匹配 → 忽略大小写/空格/全半角 → 去除"高清/4K/HD"后缀</p>
  </div>

  <div class="guide-section">
    <h3>添加频道或别名</h3>
    <p>编辑 GitHub 仓库中的 <code style="background:var(--bg);padding:1px 4px;border-radius:3px">config/channels.yaml</code> 文件：</p>
    <div class="code-block">- id: "MyChannel"
  name: "我的频道"
  group: "卫视"
  aliases:
    - "我的频道"
    - "我的频道4K"     ← 添加新别名
  sources:
    - type: "epgpw_api"
      id: "12345"</div>
    <p>提交后 GitHub Actions 自动重新抓取，约 3-5 分钟生效。</p>
    <p><a href="https://github.com/zqs1qiwan/laobaiepg/blob/main/config/channels.yaml" target="_blank">→ 在 GitHub 上编辑 channels.yaml</a></p>
  </div>

  <div class="guide-section">
    <h3>添加自定义数据源</h3>
    <p>编辑 <code style="background:var(--bg);padding:1px 4px;border-radius:3px">config/sources.yaml</code> 添加新的 EPG 数据源地址。</p>
    <p><a href="https://github.com/zqs1qiwan/laobaiepg/blob/main/config/sources.yaml" target="_blank">→ 在 GitHub 上编辑 sources.yaml</a></p>
  </div>

  <div class="guide-section">
    <h3>手动触发更新</h3>
    <p>正常情况下每8小时自动更新（北京时间 09:00 / 17:00 / 01:00）。如需立即更新，前往 GitHub Actions 手动触发。</p>
    <p><a href="https://github.com/zqs1qiwan/laobaiepg/actions/workflows/grab.yml" target="_blank">→ 在 GitHub Actions 中手动触发抓取</a></p>
  </div>

</div>

<script>
// ── 全局状态 ──
const BASE = window.location.origin;
let allChannels = [];
let activeGroup = 'ALL';

// ── 分组颜色映射 ──
const GROUP_COLOR = {
  '央视': '#3b82f6', '卫视': '#8b5cf6', '港澳台': '#ec4899',
  '地方台': '#f59e0b', '数字付费': '#10b981', '卫星': '#06b6d4',
  '少儿': '#f97316', '默认': '#64748b'
};
function groupColor(g) {
  return GROUP_COLOR[g] || GROUP_COLOR['默认'];
}

// ── Tab 切换 ──
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    const names = ['status','channels','match','guide'];
    t.classList.toggle('active', names[i] === name);
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'channels' && allChannels.length === 0) loadChannels();
}

// ── 初始化 ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('workerHost').textContent = window.location.host;
  // 填写 EPG URLs
  ['url-full','url-gz','url-ml','url-hktw'].forEach((id, i) => {
    const paths = ['/guide.xml', '/guide.xml.gz', '/guide_mainland.xml', '/guide_hktw.xml'];
    document.getElementById(id).textContent = BASE + paths[i];
  });
  document.getElementById('guide-epg-url').textContent = BASE + '/guide.xml.gz';
  loadStatus();
});

// ── 复制 URL ──
function copyUrl(elemId) {
  const text = document.getElementById(elemId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btnId = 'copy-' + elemId.replace('url-', '');
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.textContent = '已复制!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = '复制'; btn.classList.remove('copied'); }, 1800);
  });
}

// ── 加载状态 ──
async function loadStatus() {
  try {
    const [statusRes, chRes] = await Promise.all([
      fetch(BASE + '/status'),
      fetch(BASE + '/channels.json'),
    ]);
    const status = await statusRes.json();
    const channels = await chRes.json();

    // 统计
    const total = channels.length;
    const hasEpg = channels.filter(c => c.hasEpg).length;
    const rate = total > 0 ? (hasEpg / total * 100).toFixed(1) : 0;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-hasepg').textContent = hasEpg;
    document.getElementById('stat-rate').textContent = rate + '%';
    document.getElementById('progress-text').textContent = hasEpg + ' / ' + total + ' 个频道有节目单';
    document.getElementById('progress-fill').style.width = rate + '%';

    // 最后更新时间
    if (status.guide_xml?.last_modified) {
      const d = new Date(status.guide_xml.last_modified);
      const str = d.toISOString().replace('T', ' ').slice(0, 16);
      document.getElementById('stat-updated').textContent = str;
    } else {
      document.getElementById('stat-updated').textContent = '未知';
    }

    // 文件状态
    const files = [
      { name: 'guide.xml', key: 'guide_xml' },
      { name: 'guide.xml.gz', key: 'guide_xml' },
      { name: 'channels.json', key: 'guide_xml' },
    ];
    const gx = status.guide_xml;
    const rows = [
      renderStatusRow('guide.xml', gx ? true : false,
        gx ? ((gx.size / 1024).toFixed(0) + ' KB') : '不存在',
        gx?.last_modified ? new Date(gx.last_modified).toISOString().replace('T',' ').slice(0,16) + ' UTC' : ''),
      renderStatusRow('guide.xml.gz', gx ? true : false, '', ''),
      renderStatusRow('channels.json', channels.length > 0 ? true : false,
        channels.length + ' 个频道', ''),
    ];
    document.getElementById('statusRows').innerHTML = rows.join('');

    // 保存频道数据供频道列表使用
    allChannels = channels;

  } catch(e) {
    document.getElementById('statusRows').innerHTML =
      '<div class="empty-text" style="color:var(--red)">加载失败: ' + e.message + '</div>';
  }
}

function renderStatusRow(name, ok, meta, time) {
  return \`<div class="status-row">
    <div class="status-dot \${ok ? 'ok' : 'err'}"></div>
    <span class="status-filename">\${name}</span>
    <span class="status-meta">\${meta}</span>
    <span class="status-meta" style="margin-left:auto">\${time}</span>
  </div>\`;
}

// ── 加载频道列表 ──
async function loadChannels() {
  document.getElementById('channelGrid').innerHTML = '<div class="loading-text">加载中…</div>';
  try {
    if (allChannels.length === 0) {
      const res = await fetch(BASE + '/channels.json');
      allChannels = await res.json();
    }
    buildGroupFilters();
    filterChannels();
  } catch(e) {
    document.getElementById('channelGrid').innerHTML =
      '<div class="empty-text" style="color:var(--red)">加载失败: ' + e.message + '</div>';
  }
}

function buildGroupFilters() {
  const groups = ['ALL', ...new Set(allChannels.map(c => c.group).filter(Boolean))];
  const html = groups.map(g => \`<button class="filter-btn \${g === activeGroup ? 'active' : ''}"
    onclick="setGroup('\${g}')">\${g === 'ALL' ? '全部' : g}</button>\`).join('');
  document.getElementById('groupFilters').innerHTML = html;
}

function setGroup(g) {
  activeGroup = g;
  buildGroupFilters();
  filterChannels();
}

function filterChannels() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const filtered = allChannels.filter(ch => {
    const groupOk = activeGroup === 'ALL' || ch.group === activeGroup;
    if (!groupOk) return false;
    if (!q) return true;
    const inName  = (ch.name || '').toLowerCase().includes(q);
    const inId    = (ch.id   || '').toLowerCase().includes(q);
    const inAlias = (ch.aliases || []).some(a => a.toLowerCase().includes(q));
    return inName || inId || inAlias;
  });
  renderChannelGrid(filtered);
}

function renderChannelGrid(channels) {
  if (channels.length === 0) {
    document.getElementById('channelGrid').innerHTML = '<div class="empty-text">没有匹配的频道</div>';
    return;
  }
  document.getElementById('channelGrid').innerHTML = channels.map(ch => renderChannelCard(ch)).join('');
}

function renderChannelCard(ch) {
  const color = groupColor(ch.group);
  const logoUrl = 'https://logo.laobaitv.net/' + ch.id;
  // 台标：img with onerror 降级为文字
  const logoHtml = \`<img class="ch-logo" src="\${logoUrl}"
    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
    alt="">
  <div class="ch-logo-fallback" style="background:\${color};display:none">\${ch.name}</div>\`;

  const epgHtml = ch.hasEpg
    ? \`<div class="ch-epg-status ok">✓ \${ch.programmeCount} 条节目</div>\`
    : \`<div class="ch-epg-status none">✗ 无节目单</div>\`;

  // 数据源
  const sources = ch.sources || [];
  const sourceHtml = sources.length > 0
    ? sources.map(s => \`<span class="source-badge">\${s.type}:\${s.id || ''}</span>\`).join(' ')
    : '<span class="source-badge" style="color:var(--red)">无数据源</span>';

  // 别名（最多显示6个，超出省略）
  const aliases = ch.aliases || [];
  const aliasHtml = aliases.length > 0
    ? aliases.slice(0, 8).map(a => \`<span class="alias-tag">\${a}</span>\`).join('')
      + (aliases.length > 8 ? \`<span class="alias-tag" style="color:var(--accent)">+\${aliases.length - 8}</span>\` : '')
    : '<span style="color:var(--muted);font-size:11px">无别名</span>';

  return \`<div class="ch-card \${ch.hasEpg ? 'has-epg' : 'no-epg'}" onclick="toggleCard(this)">
    <div class="ch-header">
      \${logoHtml}
      <div class="ch-title">
        <div class="ch-name">\${ch.name}</div>
        <span class="ch-group-tag" style="background:\${color}">\${ch.group || ''}</span>
      </div>
    </div>
    <div class="ch-id">\${ch.id}</div>
    <div class="ch-source">\${sourceHtml}</div>
    \${epgHtml}
    <div class="ch-aliases">
      <div class="alias-label">别名列表（共 \${aliases.length} 个）</div>
      <div class="alias-tags">\${aliasHtml}</div>
    </div>
  </div>\`;
}

function toggleCard(el) {
  el.classList.toggle('expanded');
}

// ── 匹配测试 ──
async function testMatch() {
  const name = document.getElementById('matchInput').value.trim();
  if (!name) return;
  const res = document.getElementById('matchResult');
  res.style.display = 'block';
  res.className = 'match-result loading';
  res.innerHTML = '测试中…';
  try {
    const r = await fetch(BASE + '/match?name=' + encodeURIComponent(name));
    const d = await r.json();
    if (d.matched) {
      res.className = 'match-result ok';
      res.innerHTML = '✓ 匹配成功'
        + \`<div class="match-detail">输入: <b>\${d.query}</b><br>归一化: \${d.normalized}<br>匹配到: <b>\${d.matched.name}</b>（\${d.matched.id}）[\${d.matched.group || ''}]</div>\`;
    } else {
      res.className = 'match-result fail';
      res.innerHTML = '✗ 未匹配到任何频道'
        + \`<div class="match-detail">输入: \${d.query}<br>归一化: \${d.normalized}</div>\`;
    }
  } catch(e) {
    res.className = 'match-result fail';
    res.innerHTML = '请求失败: ' + e.message;
  }
}

async function batchTest() {
  const lines = document.getElementById('batchInput').value
    .split('\\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) return;
  document.getElementById('batchResult').style.display = 'block';
  const tbody = document.getElementById('batchBody');
  tbody.innerHTML = '<tr><td colspan="3" style="color:var(--muted);padding:8px">测试中…</td></tr>';

  const rows = await Promise.all(lines.map(async name => {
    try {
      const r = await fetch(BASE + '/match?name=' + encodeURIComponent(name));
      const d = await r.json();
      return { name, matched: d.matched, ok: d.success };
    } catch { return { name, matched: null, ok: false }; }
  }));

  tbody.innerHTML = rows.map(r =>
    \`<tr>
      <td>\${r.name}</td>
      <td>\${r.matched ? r.matched.name + ' <span style="color:var(--muted);font-size:11px">(' + r.matched.id + ')</span>' : '-'}</td>
      <td class="\${r.ok ? 'ok-text' : 'fail-text'}">\${r.ok ? '✓ 匹配' : '✗ 未匹配'}</td>
    </tr>\`
  ).join('');
}
</script>
</body>
</html>`;
