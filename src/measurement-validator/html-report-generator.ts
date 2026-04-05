// Self-contained HTML report generator for validation results.
//
// Produces a single HTML file with:
//   - Embedded CSS (no external dependencies)
//   - Summary statistics cards
//   - Filterable results table (client-side JS, no framework)
//   - Print-friendly layout
//   - Loads in < 2 seconds even for 1000+ rows

import type { LanguageCategory, ValidationResult } from './types.ts'
import { buildSummary } from './report-formatter.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmt2(n: number): string {
  return parseFloat(n.toFixed(2)).toString()
}

const SEVERITY_COLOR: Record<string, string> = {
  exact: '#16a34a',
  close: '#22c55e',
  warning: '#d97706',
  error: '#dc2626',
  critical: '#991b1b',
}

const SEVERITY_BG: Record<string, string> = {
  exact: '#f0fdf4',
  close: '#f0fdf4',
  warning: '#fffbeb',
  error: '#fef2f2',
  critical: '#fef2f2',
}

const LANGUAGE_LABELS: Partial<Record<LanguageCategory, string>> = {
  english: 'English',
  arabic: 'Arabic',
  hebrew: 'Hebrew',
  urdu: 'Urdu',
  chinese: 'Chinese',
  japanese: 'Japanese',
  korean: 'Korean',
  thai: 'Thai',
  myanmar: 'Myanmar',
  khmer: 'Khmer',
  mixed: 'Mixed',
  unknown: 'Unknown',
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  color: #1f2937;
  background: #f9fafb;
  line-height: 1.5;
}
.container { max-width: 1280px; margin: 0 auto; padding: 24px 16px; }
h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
.subtitle { color: #6b7280; font-size: 13px; margin-bottom: 24px; }

/* Summary cards */
.cards { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px 20px;
  min-width: 130px;
  flex: 1;
}
.card .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
.card .value { font-size: 28px; font-weight: 700; margin-top: 2px; }
.card.pass .value { color: #16a34a; }
.card.warn .value { color: #d97706; }
.card.fail .value { color: #dc2626; }

/* Filters */
.filters {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.filters label { font-size: 12px; color: #6b7280; margin-right: 4px; }
.filters select, .filters input[type="text"] {
  font-size: 13px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 8px;
  background: #fff;
  color: #1f2937;
}
.filters input[type="text"] { min-width: 160px; }
.btn-reset {
  font-size: 13px;
  padding: 4px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  color: #374151;
}
.btn-reset:hover { background: #f3f4f6; }

/* Table */
.table-wrap {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}
table { width: 100%; border-collapse: collapse; }
thead { background: #f3f4f6; }
th {
  padding: 10px 14px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
}
th:hover { background: #e5e7eb; }
th.num { text-align: right; }
td { padding: 9px 14px; border-top: 1px solid #f3f4f6; font-size: 13px; vertical-align: middle; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
td.text-col { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
tr:hover td { background: #f9fafb; }
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}
.count-row { color: #6b7280; font-size: 12px; padding: 8px 14px; border-top: 1px solid #e5e7eb; }
.hidden { display: none; }

@media print {
  body { background: #fff; font-size: 11px; }
  .filters { display: none; }
  .container { max-width: 100%; padding: 0; }
}
`

// ---------------------------------------------------------------------------
// Client-side JS (inlined)
// ---------------------------------------------------------------------------

const JS = `
(function() {
  const tbody = document.getElementById('tbody');
  const rows  = Array.from(tbody.querySelectorAll('tr'));
  const countEl = document.getElementById('row-count');
  const selSeverity = document.getElementById('f-severity');
  const selLanguage = document.getElementById('f-language');
  const txtFont     = document.getElementById('f-font');
  const btnReset    = document.getElementById('btn-reset');

  let sortCol = -1, sortAsc = true;

  function applyFilters() {
    const sv = selSeverity.value;
    const lv = selLanguage.value;
    const fv = txtFont.value.toLowerCase();
    let visible = 0;
    rows.forEach(function(tr) {
      const ds = tr.dataset;
      const show =
        (sv === '' || ds.severity === sv) &&
        (lv === '' || ds.language === lv) &&
        (fv === '' || (ds.font || '').toLowerCase().includes(fv));
      tr.classList.toggle('hidden', !show);
      if (show) visible++;
    });
    countEl.textContent = visible + ' of ' + rows.length + ' results';
  }

  function sortBy(colIdx) {
    if (sortCol === colIdx) { sortAsc = !sortAsc; } else { sortCol = colIdx; sortAsc = true; }
    rows.sort(function(a, b) {
      const av = a.cells[colIdx] ? a.cells[colIdx].dataset.val || a.cells[colIdx].textContent : '';
      const bv = b.cells[colIdx] ? b.cells[colIdx].dataset.val || b.cells[colIdx].textContent : '';
      const an = parseFloat(av), bn = parseFloat(bv);
      const cmp = isNaN(an) || isNaN(bn) ? av.localeCompare(bv) : an - bn;
      return sortAsc ? cmp : -cmp;
    });
    rows.forEach(function(tr) { tbody.appendChild(tr); });
  }

  selSeverity.addEventListener('change', applyFilters);
  selLanguage.addEventListener('change', applyFilters);
  txtFont.addEventListener('input', applyFilters);
  btnReset.addEventListener('click', function() {
    selSeverity.value = '';
    selLanguage.value = '';
    txtFont.value = '';
    applyFilters();
  });

  document.querySelectorAll('th[data-col]').forEach(function(th) {
    th.addEventListener('click', function() {
      sortBy(parseInt(th.dataset.col, 10));
    });
  });

  applyFilters();
})();
`

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

/**
 * Generate a self-contained HTML report from validation results.
 *
 * The file has no external dependencies — all CSS and JS are inlined — so
 * it can be opened directly in any browser or attached to a PR/issue.
 */
export function generateHTMLReport(results: ValidationResult[]): string {
  const s = buildSummary(results)
  const generatedAt = new Date().toISOString()

  // Collect unique languages for the filter dropdown
  const languages = [...new Set(results.map((r) => r.language))].sort()

  // ---- Summary cards -------------------------------------------------------
  const cards = [
    { label: 'Total', value: s.total, cls: '' },
    {
      label: 'Pass rate',
      value: `${s.passRate.toFixed(1)}%`,
      cls: s.passRate >= 99 ? 'pass' : s.passRate >= 90 ? 'warn' : 'fail',
    },
    { label: 'Exact', value: s.exact, cls: 'pass' },
    { label: 'Close', value: s.close, cls: 'pass' },
    { label: 'Warning', value: s.warning, cls: 'warn' },
    { label: 'Error', value: s.error, cls: 'fail' },
    { label: 'Critical', value: s.critical, cls: 'fail' },
  ]

  const cardsHTML = cards
    .map(
      (c) =>
        `<div class="card ${escapeHTML(c.cls)}">` +
        `<div class="label">${escapeHTML(c.label)}</div>` +
        `<div class="value">${escapeHTML(String(c.value))}</div>` +
        `</div>`,
    )
    .join('\n    ')

  // ---- Language filter options ---------------------------------------------
  const langOptions = languages
    .map((l) => {
      const label = LANGUAGE_LABELS[l] ?? l
      return `<option value="${escapeHTML(l)}">${escapeHTML(label)}</option>`
    })
    .join('\n      ')

  // ---- Table rows ----------------------------------------------------------
  const tableRows = results
    .map((r) => {
      const color = SEVERITY_COLOR[r.severity] ?? '#374151'
      const bg = SEVERITY_BG[r.severity] ?? '#fff'
      const langLabel = LANGUAGE_LABELS[r.language] ?? r.language
      return (
        `<tr data-severity="${escapeHTML(r.severity)}" ` +
        `data-language="${escapeHTML(r.language)}" ` +
        `data-font="${escapeHTML(r.font)}">` +
        `<td class="text-col" title="${escapeHTML(r.text)}">${escapeHTML(r.text.slice(0, 60))}</td>` +
        `<td>${escapeHTML(r.font)}</td>` +
        `<td class="num" data-val="${r.pretextWidth}">${fmt2(r.pretextWidth)}</td>` +
        `<td class="num" data-val="${r.domWidth}">${fmt2(r.domWidth)}</td>` +
        `<td class="num" data-val="${r.delta}">${fmt2(r.delta)}</td>` +
        `<td class="num" data-val="${r.deltaPercent}">${fmt2(r.deltaPercent)}%</td>` +
        `<td><span class="badge" style="color:${color};background:${bg}">${escapeHTML(r.severity)}</span></td>` +
        `<td>${escapeHTML(langLabel)}</td>` +
        `<td>${escapeHTML(r.rootCause === 'none' ? '—' : r.rootCause)}</td>` +
        `</tr>`
      )
    })
    .join('\n      ')

  // ---- Assemble HTML -------------------------------------------------------
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Measurement Validator Report</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">
  <h1>📐 Measurement Validator Report</h1>
  <p class="subtitle">Generated: ${escapeHTML(generatedAt)} · ${s.total} samples · @chenglou/pretext</p>

  <div class="cards">
    ${cardsHTML}
  </div>

  <div class="filters">
    <label for="f-severity">Severity</label>
    <select id="f-severity">
      <option value="">All</option>
      <option value="exact">✅ Exact</option>
      <option value="close">✅ Close</option>
      <option value="warning">⚠️ Warning</option>
      <option value="error">❌ Error</option>
      <option value="critical">🔴 Critical</option>
    </select>
    <label for="f-language">Language</label>
    <select id="f-language">
      <option value="">All</option>
      ${langOptions}
    </select>
    <label for="f-font">Font</label>
    <input type="text" id="f-font" placeholder="filter by font…">
    <button class="btn-reset" id="btn-reset">Reset</button>
    <span class="count-row" id="row-count"></span>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th data-col="0">Text</th>
          <th data-col="1">Font</th>
          <th class="num" data-col="2">Pretext (px)</th>
          <th class="num" data-col="3">DOM (px)</th>
          <th class="num" data-col="4">Δ (px)</th>
          <th class="num" data-col="5">Δ %</th>
          <th data-col="6">Severity</th>
          <th data-col="7">Language</th>
          <th data-col="8">Root Cause</th>
        </tr>
      </thead>
      <tbody id="tbody">
      ${tableRows}
      </tbody>
    </table>
  </div>
</div>
<script>${JS}</script>
</body>
</html>`
}
