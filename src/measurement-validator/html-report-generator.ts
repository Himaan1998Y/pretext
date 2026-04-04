import type { MeasurementResult } from './types.js'
import { computeSummary, computeStatsByLanguage } from './stats.js'

export interface HTMLReportOptions {
  title?: string
  includeCharts?: boolean
  includeSummary?: boolean
  resultsPerPage?: number
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function severityBadge(severity: MeasurementResult['overallSeverity']): string {
  const classes: Record<string, string> = {
    pass: 'badge-pass',
    warning: 'badge-warning',
    error: 'badge-error',
    critical: 'badge-critical',
  }
  const labels: Record<string, string> = {
    pass: '✅ pass',
    warning: '⚠️ warning',
    error: '❌ error',
    critical: '🔴 critical',
  }
  const cls = classes[severity] ?? 'badge-pass'
  const label = labels[severity] ?? severity
  return `<span class="badge ${cls}">${label}</span>`
}

export function generateHTMLReport(
  results: MeasurementResult[],
  options: HTMLReportOptions = {},
): string {
  const title = options.title ?? 'Measurement Validator Report'
  const includeSummary = options.includeSummary ?? true
  const summary = computeSummary(results)
  const byLanguage = computeStatsByLanguage(results)
  const now = new Date().toUTCString()

  const pct = (n: number): string =>
    summary.total === 0 ? '0.0%' : ((n / summary.total) * 100).toFixed(1) + '%'

  const summaryHTML = includeSummary
    ? `
    <section class="summary">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="summary-card pass">
          <div class="summary-count">${summary.passed.toLocaleString()}</div>
          <div class="summary-label">Passed (${pct(summary.passed)})</div>
        </div>
        <div class="summary-card warning">
          <div class="summary-count">${summary.warnings.toLocaleString()}</div>
          <div class="summary-label">Warnings (${pct(summary.warnings)})</div>
        </div>
        <div class="summary-card error">
          <div class="summary-count">${summary.errors.toLocaleString()}</div>
          <div class="summary-label">Errors (${pct(summary.errors)})</div>
        </div>
        <div class="summary-card critical">
          <div class="summary-count">${summary.critical.toLocaleString()}</div>
          <div class="summary-label">Critical (${pct(summary.critical)})</div>
        </div>
      </div>
    </section>`
    : ''

  const languageRows = Object.values(byLanguage)
    .map(
      s => `
      <tr>
        <td>${escapeHTML(s.language)}</td>
        <td>${s.total}</td>
        <td>${s.passed}</td>
        <td>${s.warnings}</td>
        <td>${s.errors}</td>
        <td>${s.critical}</td>
      </tr>`,
    )
    .join('')

  const languageTableHTML =
    languageRows.length > 0
      ? `
    <section class="by-language">
      <h2>Results by Language</h2>
      <table>
        <thead>
          <tr>
            <th>Language</th><th>Total</th><th>Passed</th>
            <th>Warnings</th><th>Errors</th><th>Critical</th>
          </tr>
        </thead>
        <tbody>${languageRows}</tbody>
      </table>
    </section>`
      : ''

  const resultRows = results
    .map(
      r => `
      <tr data-severity="${escapeHTML(r.overallSeverity)}" data-language="${escapeHTML(r.language)}">
        <td>${escapeHTML(r.sampleId)}</td>
        <td>${escapeHTML(r.text)}</td>
        <td>${escapeHTML(r.font)}</td>
        <td>${r.maxWidth}</td>
        <td>${r.pretextWidth}</td>
        <td>${r.domWidth}</td>
        <td>${r.delta.toFixed(2)}</td>
        <td>${r.errorPercent.toFixed(2)}%</td>
        <td>${severityBadge(r.overallSeverity)}</td>
        <td>${escapeHTML(r.rootCause)}</td>
        <td>${escapeHTML(r.language)}</td>
      </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; color: #111; background: #fff; }
    h1 { margin-top: 0; }
    h2 { margin-top: 2rem; }
    .meta { color: #555; font-size: 0.875rem; margin-bottom: 1rem; }
    .summary-grid { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .summary-card { padding: 1rem 1.5rem; border-radius: 8px; min-width: 140px; text-align: center; }
    .summary-card.pass { background: #d1fae5; }
    .summary-card.warning { background: #fef3c7; }
    .summary-card.error { background: #fee2e2; }
    .summary-card.critical { background: #fce7f3; }
    .summary-count { font-size: 2rem; font-weight: 700; }
    .summary-label { font-size: 0.85rem; }
    .filters { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .filters label { font-size: 0.875rem; }
    .filters select { font-size: 0.875rem; padding: 0.25rem 0.5rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { background: #f3f4f6; text-align: left; padding: 0.5rem 0.75rem; border-bottom: 2px solid #e5e7eb; }
    td { padding: 0.4rem 0.75rem; border-bottom: 1px solid #e5e7eb; }
    tr:hover td { background: #f9fafb; }
    .badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; white-space: nowrap; }
    .badge-pass { background: #d1fae5; color: #065f46; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-error { background: #fee2e2; color: #991b1b; }
    .badge-critical { background: #fce7f3; color: #9d174d; }
    @media print {
      .filters { display: none; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <h1>${escapeHTML(title)}</h1>
  <p class="meta">Generated: ${escapeHTML(now)} &mdash; ${results.length.toLocaleString()} samples</p>

  ${summaryHTML}

  ${languageTableHTML}

  <section class="results">
    <h2>All Results</h2>
    <div class="filters">
      <label>
        Language:
        <select id="filter-language" onchange="applyFilters()">
          <option value="">All</option>
          ${[...new Set(results.map(r => r.language))].map(l => `<option value="${escapeHTML(l)}">${escapeHTML(l)}</option>`).join('')}
        </select>
      </label>
      <label>
        Severity:
        <select id="filter-severity" onchange="applyFilters()">
          <option value="">All</option>
          <option value="pass">Pass</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
          <option value="critical">Critical</option>
        </select>
      </label>
    </div>
    <table id="results-table">
      <thead>
        <tr>
          <th>Sample</th><th>Text</th><th>Font</th><th>MaxWidth</th>
          <th>Pretext</th><th>DOM</th><th>Delta</th><th>Error%</th>
          <th>Severity</th><th>Root Cause</th><th>Lang</th>
        </tr>
      </thead>
      <tbody id="results-body">
        ${resultRows}
      </tbody>
    </table>
  </section>

  <script>
    function applyFilters() {
      var lang = document.getElementById('filter-language').value;
      var sev = document.getElementById('filter-severity').value;
      var rows = document.querySelectorAll('#results-body tr');
      rows.forEach(function(row) {
        var matchLang = !lang || row.dataset.language === lang;
        var matchSev = !sev || row.dataset.severity === sev;
        row.style.display = matchLang && matchSev ? '' : 'none';
      });
    }
  </script>
</body>
</html>`
}
