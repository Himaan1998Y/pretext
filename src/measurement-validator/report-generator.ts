// Report generator: produce JSON, console, CSV, Markdown, and HTML output
// from a set of ComparisonResults.

import type { ComparisonResult, ValidatorReport } from './types.js'

// ─── Build report ─────────────────────────────────────────────────────────────

/** Build a ValidatorReport from a list of ComparisonResults. */
export function buildReport(results: ComparisonResult[]): ValidatorReport {
  const passed = results.filter((r) => r.severity === 'exact').length
  return {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length === 0 ? 1 : passed / results.length,
    results,
  }
}

// ─── Console ──────────────────────────────────────────────────────────────────

const SEVERITY_ICON: Record<string, string> = {
  exact: '✅',
  minor: '⚠️ ',
  major: '❌',
  critical: '🔴',
}

/** Print a human-readable summary to the console. */
export function printConsoleReport(report: ValidatorReport): void {
  const pct = (report.passRate * 100).toFixed(1)
  console.log(`\nMeasurement Validator Report — ${report.timestamp}`)
  console.log(`${'─'.repeat(60)}`)
  console.log(`  ${report.passed}/${report.total} passed (${pct}%)`)
  console.log(`${'─'.repeat(60)}`)

  for (const r of report.results) {
    const icon = SEVERITY_ICON[r.severity] ?? '?'
    const dom = Number.isNaN(r.domHeight) ? 'n/a (no DOM)' : `${r.domHeight}px`
    const diff = Number.isNaN(r.domHeight) ? '' : ` diff=${r.diffPx.toFixed(1)}px`
    console.log(`  ${icon} [${r.sample.label}] pretext=${r.pretextHeight}px dom=${dom}${diff} (${r.executionTimeMs.toFixed(2)}ms)`)
  }

  console.log(`${'─'.repeat(60)}\n`)
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

/** Serialize the report as pretty-printed JSON. */
export function toJSON(report: ValidatorReport): string {
  return JSON.stringify(report, null, 2)
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

function csvEscape(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Serialize the report as UTF-8 CSV (with BOM for Excel compatibility).
 *
 * Columns: label, text, font, maxWidth, lineHeight, pretextHeight, domHeight,
 *          diffPx, severity, executionTimeMs
 */
export function toCSV(report: ValidatorReport): string {
  const HEADER = [
    'label',
    'text',
    'font',
    'maxWidth',
    'lineHeight',
    'pretextHeight',
    'domHeight',
    'diffPx',
    'severity',
    'executionTimeMs',
  ]

  const rows = report.results.map((r) =>
    [
      r.sample.label,
      r.sample.text,
      r.sample.font,
      r.sample.maxWidth,
      r.sample.lineHeight,
      r.pretextHeight,
      Number.isNaN(r.domHeight) ? '' : r.domHeight,
      Number.isNaN(r.domHeight) ? '' : r.diffPx.toFixed(2),
      r.severity,
      r.executionTimeMs.toFixed(2),
    ]
      .map(csvEscape)
      .join(','),
  )

  // UTF-8 BOM + header + rows
  return '\uFEFF' + [HEADER.join(','), ...rows].join('\n') + '\n'
}

// ─── Markdown ─────────────────────────────────────────────────────────────────

/**
 * Serialize the report as GitHub-flavored Markdown with a summary and table.
 */
export function toMarkdown(report: ValidatorReport): string {
  const pct = (report.passRate * 100).toFixed(1)
  const statusLine =
    report.failed === 0
      ? `✅ **${report.passed}/${report.total} passed (${pct}%)**`
      : `❌ **${report.passed}/${report.total} passed (${pct}%) — ${report.failed} failure(s)**`

  const header = [
    '## Measurement Validator Report',
    '',
    `Generated: ${report.timestamp}`,
    '',
    statusLine,
    '',
    '| Label | Pretext (px) | DOM (px) | Diff (px) | Severity | Time (ms) |',
    '|-------|-------------|---------|----------|----------|-----------|',
  ]

  const rows = report.results.map((r) => {
    const dom = Number.isNaN(r.domHeight) ? 'n/a' : String(r.domHeight)
    const diff = Number.isNaN(r.domHeight) ? 'n/a' : r.diffPx.toFixed(2)
    const icon = SEVERITY_ICON[r.severity] ?? '?'
    return `| ${r.sample.label} | ${r.pretextHeight} | ${dom} | ${diff} | ${icon} ${r.severity} | ${r.executionTimeMs.toFixed(2)} |`
  })

  return [...header, ...rows, ''].join('\n')
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Serialize the report as a single-file HTML page with a summary and table.
 * Intentionally minimal: no external dependencies, no JavaScript.
 */
export function toHTML(report: ValidatorReport): string {
  const pct = (report.passRate * 100).toFixed(1)
  const statusColor = report.failed === 0 ? '#2da44e' : '#cf222e'
  const statusText =
    report.failed === 0
      ? `✅ ${report.passed}/${report.total} (${pct}%)`
      : `❌ ${report.passed}/${report.total} (${pct}%) — ${report.failed} failure(s)`

  const SEVERITY_COLOR: Record<string, string> = {
    exact: '#2da44e',
    minor: '#bf8700',
    major: '#cf222e',
    critical: '#8c0000',
  }

  const rows = report.results
    .map((r) => {
      const dom = Number.isNaN(r.domHeight) ? '<em>n/a</em>' : String(r.domHeight)
      const diff = Number.isNaN(r.domHeight) ? '<em>n/a</em>' : r.diffPx.toFixed(2)
      const color = SEVERITY_COLOR[r.severity] ?? '#000'
      const icon = SEVERITY_ICON[r.severity] ?? '?'
      return [
        '<tr>',
        `<td>${htmlEscape(r.sample.label)}</td>`,
        `<td>${r.pretextHeight}</td>`,
        `<td>${dom}</td>`,
        `<td>${diff}</td>`,
        `<td style="color:${color}">${icon} ${r.severity}</td>`,
        `<td>${r.executionTimeMs.toFixed(2)}</td>`,
        '</tr>',
      ].join('')
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Measurement Validator Report</title>
<style>
  body{font-family:system-ui,sans-serif;margin:2rem;color:#1f2328;background:#fff}
  h1{font-size:1.25rem;margin-bottom:.25rem}
  .summary{font-size:1.1rem;font-weight:600;color:${statusColor};margin-bottom:1rem}
  .meta{font-size:.8rem;color:#57606a;margin-bottom:1.5rem}
  table{border-collapse:collapse;width:100%;font-size:.875rem}
  th,td{padding:.5rem .75rem;text-align:left;border:1px solid #d0d7de}
  th{background:#f6f8fa;font-weight:600}
  tr:nth-child(even){background:#f6f8fa}
</style>
</head>
<body>
<h1>Measurement Validator Report</h1>
<p class="summary">${statusText}</p>
<p class="meta">Generated: ${htmlEscape(report.timestamp)}</p>
<table>
<thead>
<tr>
  <th>Label</th>
  <th>Pretext (px)</th>
  <th>DOM (px)</th>
  <th>Diff (px)</th>
  <th>Severity</th>
  <th>Time (ms)</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>
`
}
