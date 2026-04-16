// Self-contained dashboard web UI served by the DashboardServer.
// Single-file HTML/CSS/JS with no external dependencies.

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Measurement Validator Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#f8f9fa;color:#212529;padding:0}
header{background:#1a1a2e;color:#fff;padding:16px 24px;display:flex;align-items:center;gap:12px}
header h1{font-size:1.125rem;font-weight:600}
.status-dot{width:10px;height:10px;border-radius:50%;background:#6c757d;flex-shrink:0}
.status-dot.connected{background:#198754}
.main{padding:24px;max-width:1400px;margin:0 auto}
.cards{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px}
.card{background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:16px 20px;min-width:130px;flex:1}
.card-label{font-size:.75rem;color:#6c757d;text-transform:uppercase;letter-spacing:.05em}
.card-value{font-size:1.75rem;font-weight:700;margin-top:4px}
.pass{color:#198754}.warn{color:#fd7e14}.fail{color:#dc3545}.muted{color:#6c757d}
.section-title{font-size:1rem;font-weight:600;margin-bottom:12px;display:flex;gap:8px;align-items:center}
.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
.filters input,.filters select{padding:6px 10px;border:1px solid #dee2e6;border-radius:6px;font-size:.875rem}
.table-wrap{overflow-x:auto;border:1px solid #dee2e6;border-radius:8px}
table{width:100%;border-collapse:collapse;background:#fff;font-size:.8125rem}
th{background:#f1f3f5;padding:9px 12px;text-align:left;font-weight:600;border-bottom:1px solid #dee2e6;white-space:nowrap}
td{padding:7px 12px;border-bottom:1px solid #f1f3f5;word-break:break-word;max-width:260px}
tr:last-child td{border-bottom:none}
tr:hover td{background:#f8f9fa}
.badge{display:inline-block;padding:1px 7px;border-radius:999px;font-size:.7rem;font-weight:600;white-space:nowrap}
.badge-pass{background:#d1e7dd;color:#0a3622}
.badge-warning{background:#fff3cd;color:#664d03}
.badge-critical{background:#f8d7da;color:#58151c}
.hidden{display:none}
.trends-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:24px}
.trend-card{background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:14px}
.trend-lang{font-weight:600;margin-bottom:8px;font-size:.875rem}
.trend-row{display:flex;justify-content:space-between;font-size:.8125rem;color:#6c757d;padding:2px 0}
.trend-row span:last-child{color:#212529;font-variant-numeric:tabular-nums}
.live-badge{background:#d1e7dd;color:#0a3622;font-size:.7rem;font-weight:700;padding:1px 7px;border-radius:999px}
</style>
</head>
<body>
<header>
  <div class="status-dot" id="ws-dot" title="WebSocket connection"></div>
  <h1>Measurement Validator Dashboard</h1>
  <span id="last-updated" style="margin-left:auto;font-size:.8125rem;opacity:.7"></span>
</header>
<div class="main">

  <div class="cards">
    <div class="card"><div class="card-label">Total</div><div class="card-value muted" id="card-total">—</div></div>
    <div class="card"><div class="card-label">Passed</div><div class="card-value pass" id="card-pass">—</div></div>
    <div class="card"><div class="card-label">Warnings</div><div class="card-value warn" id="card-warn">—</div></div>
    <div class="card"><div class="card-label">Critical</div><div class="card-value fail" id="card-crit">—</div></div>
    <div class="card"><div class="card-label">Pass Rate</div><div class="card-value" id="card-rate">—</div></div>
  </div>

  <div class="section-title">
    Performance Trends
    <span class="live-badge">LIVE</span>
  </div>
  <div class="trends-grid" id="trends-grid">
    <div style="color:#6c757d;font-size:.875rem">Loading…</div>
  </div>

  <div class="section-title" style="margin-top:8px">Results</div>
  <div class="filters">
    <input id="f-text" type="text" placeholder="Search…" style="flex:1;min-width:140px">
    <select id="f-lang"><option value="">All languages</option></select>
    <select id="f-sev">
      <option value="">All severities</option>
      <option value="pass">Pass</option>
      <option value="warning">Warning</option>
      <option value="critical">Critical</option>
    </select>
    <button onclick="loadData()" style="padding:6px 14px;border:1px solid #dee2e6;border-radius:6px;background:#fff;cursor:pointer;font-size:.875rem">Refresh</button>
  </div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Language</th><th>Font</th><th>Severity</th><th>Reason</th>
          <th>Divergence</th><th>Canvas/DOM</th><th>Duration</th><th>Text</th>
        </tr>
      </thead>
      <tbody id="results-body">
        <tr><td colspan="8" style="text-align:center;color:#6c757d;padding:24px">Loading…</td></tr>
      </tbody>
    </table>
  </div>
</div>

<script>
let allResults=[];
let ws=null;

function pct(n){return(n*100).toFixed(1)+'%'}

function updateCards(summary){
  document.getElementById('card-total').textContent=summary.total??'—';
  document.getElementById('card-pass').textContent=summary.passed??'—';
  document.getElementById('card-warn').textContent=summary.warnings??'—';
  document.getElementById('card-crit').textContent=summary.criticals??'—';
  const rateEl=document.getElementById('card-rate');
  rateEl.textContent=typeof summary.passRate==='number'?pct(summary.passRate):'—';
  rateEl.className='card-value '+(summary.criticals>0?'fail':summary.warnings>0?'warn':'pass');
}

function updateTrends(metrics){
  const grid=document.getElementById('trends-grid');
  if(!metrics||metrics.length===0){
    grid.innerHTML='<div style="color:#6c757d;font-size:.875rem">No performance data yet.</div>';
    return;
  }
  grid.innerHTML=metrics.map(m=>\`
    <div class="trend-card">
      <div class="trend-lang">\${m.language} <span style="font-weight:400;color:#6c757d;font-size:.8rem">(\${m.sampleCount} samples)</span></div>
      <div class="trend-row"><span>Avg</span><span>\${m.avgMs.toFixed(2)}ms</span></div>
      <div class="trend-row"><span>Median</span><span>\${m.medianMs.toFixed(2)}ms</span></div>
      <div class="trend-row"><span>p95</span><span>\${m.p95Ms.toFixed(2)}ms</span></div>
      <div class="trend-row"><span>p99</span><span>\${m.p99Ms.toFixed(2)}ms</span></div>
      <div class="trend-row"><span>Min / Max</span><span>\${m.minMs.toFixed(1)} / \${m.maxMs.toFixed(1)}ms</span></div>
    </div>
  \`).join('');
}

function buildLangOptions(results){
  const langs=[...new Set(results.map(r=>r.language))].sort();
  const sel=document.getElementById('f-lang');
  const prev=sel.value;
  sel.innerHTML='<option value="">All languages</option>'+langs.map(l=>\`<option value="\${l}">\${l}</option>\`).join('');
  if(prev)sel.value=prev;
}

function renderResults(results){
  const tbody=document.getElementById('results-body');
  if(!results.length){
    tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:#6c757d;padding:24px">No results found.</td></tr>';
    return;
  }
  tbody.innerHTML=results.map(r=>{
    const badge=r.severity==='pass'?'badge-pass':r.severity==='warning'?'badge-warning':'badge-critical';
    const preview=r.text.length>45?r.text.slice(0,45)+'…':r.text;
    return \`<tr>
      <td>\${r.language}</td>
      <td>\${r.font} \${r.fontSize}px</td>
      <td><span class="badge \${badge}">\${r.severity}</span></td>
      <td>\${r.reason}</td>
      <td>\${r.divergencePixels.toFixed(2)}px</td>
      <td>\${r.canvasLineCount}/\${r.domLineCount}</td>
      <td>\${r.durationMs.toFixed(1)}ms</td>
      <td title="\${r.text.replace(/"/g,'&quot;')}">\${preview}</td>
    </tr>\`;
  }).join('');
}

function applyFilters(){
  const text=(document.getElementById('f-text').value||'').toLowerCase();
  const lang=document.getElementById('f-lang').value;
  const sev=document.getElementById('f-sev').value;
  let filtered=allResults.filter(r=>{
    if(lang&&r.language!==lang)return false;
    if(sev&&r.severity!==sev)return false;
    if(text&&!JSON.stringify(r).toLowerCase().includes(text))return false;
    return true;
  });
  renderResults(filtered);
}

['f-text','f-lang','f-sev'].forEach(id=>{
  const el=document.getElementById(id);
  if(el)el.addEventListener('input',applyFilters);
});

async function loadData(){
  try{
    const [resResp,summResp,trendsResp]=await Promise.all([
      fetch('/api/results?limit=500'),
      fetch('/api/summary'),
      fetch('/api/performance/trends'),
    ]);
    allResults=await resResp.json();
    const summary=await summResp.json();
    const trends=await trendsResp.json();
    updateCards(summary);
    buildLangOptions(allResults);
    updateTrends(trends);
    applyFilters();
    document.getElementById('last-updated').textContent='Updated: '+new Date().toLocaleTimeString();
  }catch(e){
    console.error('Failed to load dashboard data',e);
  }
}

function connectWs(){
  const proto=location.protocol==='https:'?'wss:':'ws:';
  ws=new WebSocket(proto+'//'+location.host+'/ws');
  const dot=document.getElementById('ws-dot');
  ws.onopen=()=>{dot.classList.add('connected')};
  ws.onclose=()=>{dot.classList.remove('connected');setTimeout(connectWs,3000)};
  ws.onerror=()=>{};
  ws.onmessage=(e)=>{
    try{
      const msg=JSON.parse(e.data);
      if(msg.type==='results'){
        allResults=[...msg.payload,...allResults].slice(0,1000);
        loadData();
      }
    }catch{}
  };
}

loadData();
connectWs();
</script>
</body>
</html>
`
