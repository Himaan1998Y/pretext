// HTML report generator for measurement results.
// Produces a self-contained single-file HTML report with filterable results.

import type { MeasurementResult, ValidationSummary } from './types.js'
import { buildLanguageBreakdown } from './classifier.js'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#f8f9fa;color:#212529;padding:24px}
h1{font-size:1.5rem;margin-bottom:4px}
.subtitle{color:#6c757d;font-size:.875rem;margin-bottom:24px}
.cards{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px}
.card{background:#fff;border:1px solid #dee2e6;border-radius:8px;padding:16px 24px;min-width:140px}
.card-label{font-size:.75rem;color:#6c757d;text-transform:uppercase;letter-spacing:.05em}
.card-value{font-size:1.75rem;font-weight:700;margin-top:4px}
.pass{color:#198754}.warn{color:#fd7e14}.fail{color:#dc3545}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dee2e6;border-radius:8px;overflow:hidden;font-size:.875rem}
th{background:#f1f3f5;padding:10px 12px;text-align:left;font-weight:600;border-bottom:1px solid #dee2e6}
td{padding:8px 12px;border-bottom:1px solid #f1f3f5;word-break:break-word;max-width:320px}
tr:last-child td{border-bottom:none}
tr:hover td{background:#f8f9fa}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.75rem;font-weight:600}
.badge-pass{background:#d1e7dd;color:#0a3622}
.badge-warning{background:#fff3cd;color:#664d03}
.badge-critical{background:#f8d7da;color:#58151c}
.filters{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;align-items:center}
.filters input,.filters select{padding:6px 10px;border:1px solid #dee2e6;border-radius:6px;font-size:.875rem}
.hidden{display:none}
`

const JS = `
const filterEl=document.getElementById('filter-text');
const langEl=document.getElementById('filter-lang');
const sevEl=document.getElementById('filter-sev');
function applyFilters(){
  const text=(filterEl.value||'').toLowerCase();
  const lang=langEl.value;
  const sev=sevEl.value;
  document.querySelectorAll('tbody tr').forEach(tr=>{
    const tds=[...tr.querySelectorAll('td')].map(td=>td.textContent||'');
    const match=(!text||tds.some(t=>t.toLowerCase().includes(text)))
      &&(!lang||tds[0]===lang)
      &&(!sev||tds[3]===sev);
    tr.classList.toggle('hidden',!match);
  });
}
[filterEl,langEl,sevEl].forEach(el=>el&&el.addEventListener('input',applyFilters));
`

export function exportToHtml(
  results: MeasurementResult[],
  summary?: ValidationSummary
): string {
  const ts = new Date().toUTCString()
  const s = summary ?? {
    total: results.length,
    passed: results.filter((r) => r.severity === 'pass').length,
    warnings: results.filter((r) => r.severity === 'warning').length,
    criticals: results.filter((r) => r.severity === 'critical').length,
    passRate:
      results.length > 0
        ? results.filter((r) => r.severity === 'pass').length / results.length
        : 1,
    byLanguage: buildLanguageBreakdown(results),
    durationMs: 0,
    timestamp: Date.now(),
  }

  const passClass =
    s.criticals > 0 ? 'fail' : s.warnings > 0 ? 'warn' : 'pass'

  const langs = [...new Set(results.map((r) => r.language))].sort()
  const langOptions = langs
    .map((l) => `<option value="${esc(l)}">${esc(l)}</option>`)
    .join('')

  const rows = results
    .map((r) => {
      const preview =
        r.text.length > 50 ? esc(r.text.slice(0, 50)) + '…' : esc(r.text)
      const badgeCls =
        r.severity === 'pass'
          ? 'badge-pass'
          : r.severity === 'warning'
            ? 'badge-warning'
            : 'badge-critical'
      return `<tr>
  <td>${esc(r.language)}</td>
  <td>${esc(r.font)} ${r.fontSize}px</td>
  <td>${r.containerWidth}px</td>
  <td><span class="badge ${badgeCls}">${esc(r.severity)}</span></td>
  <td>${esc(r.reason)}</td>
  <td>${r.divergencePixels.toFixed(2)}px</td>
  <td>${r.canvasLineCount} / ${r.domLineCount}</td>
  <td>${r.durationMs.toFixed(1)}ms</td>
  <td title="${esc(r.text)}">${preview}</td>
</tr>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Measurement Validation Report</title>
<style>${CSS}</style>
</head>
<body>
<h1>Measurement Validation Report</h1>
<div class="subtitle">Generated: ${esc(ts)}</div>

<div class="cards">
  <div class="card"><div class="card-label">Total</div><div class="card-value">${s.total}</div></div>
  <div class="card"><div class="card-label">Passed</div><div class="card-value pass">${s.passed}</div></div>
  <div class="card"><div class="card-label">Warnings</div><div class="card-value warn">${s.warnings}</div></div>
  <div class="card"><div class="card-label">Critical</div><div class="card-value fail">${s.criticals}</div></div>
  <div class="card"><div class="card-label">Pass Rate</div><div class="card-value ${passClass}">${pct(s.passRate)}</div></div>
</div>

<div class="filters">
  <input id="filter-text" type="text" placeholder="Search text…" style="flex:1;min-width:160px">
  <select id="filter-lang"><option value="">All languages</option>${langOptions}</select>
  <select id="filter-sev">
    <option value="">All severities</option>
    <option value="pass">Pass</option>
    <option value="warning">Warning</option>
    <option value="critical">Critical</option>
  </select>
</div>

<table>
<thead>
<tr>
  <th>Language</th><th>Font</th><th>Width</th><th>Severity</th>
  <th>Reason</th><th>Divergence</th><th>Canvas / DOM lines</th>
  <th>Duration</th><th>Text</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>

<script>${JS}</script>
</body>
</html>
`
}
