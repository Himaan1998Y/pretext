// Report generator: formats ComparisonResult arrays into JSON, console
// summaries, and human-readable text reports.

import type {
  ComparisonResult,
  ReportSummary,
  Severity,
  ValidationReport,
} from './types.js'

// --- Summary helpers ---

function buildSummary(results: ComparisonResult[]): ReportSummary {
  let exact = 0
  let minor = 0
  let major = 0
  let critical = 0
  let lineCountMismatches = 0

  for (const r of results) {
    const s: Severity = r.metrics.severity
    if (s === 'exact') exact++
    else if (s === 'minor') minor++
    else if (s === 'major') major++
    else critical++

    if (!r.metrics.lineCountMatch) lineCountMismatches++
  }

  const total = results.length
  const passRate = total > 0 ? ((exact + minor) / total) * 100 : 100

  return { total, exact, minor, major, critical, lineCountMismatches, passRate }
}

// --- JSON report ---

/**
 * Build a structured ValidationReport from an array of comparison results.
 */
export function buildReport(results: ComparisonResult[]): ValidationReport {
  const userAgent = results.length > 0 && results[0] !== undefined ? results[0].userAgent : ''
  return {
    summary: buildSummary(results),
    results,
    generatedAt: new Date().toISOString(),
    userAgent,
  }
}

/**
 * Serialize a ValidationReport to a JSON string.
 */
export function toJSON(report: ValidationReport, pretty = false): string {
  return JSON.stringify(report, null, pretty ? 2 : undefined)
}

// --- Console / text report ---

const SEVERITY_ICON: Record<Severity, string> = {
  exact: '✅',
  minor: '🟡',
  major: '🟠',
  critical: '🔴',
}

/**
 * Return a compact multiline console summary string.
 */
export function toConsoleText(report: ValidationReport): string {
  const { summary } = report
  const lines: string[] = [
    '╔══════════════════════════════════════╗',
    '║   Measurement Validator — Summary    ║',
    '╚══════════════════════════════════════╝',
    `  Total samples : ${summary.total}`,
    `  ✅ Exact      : ${summary.exact}`,
    `  🟡 Minor      : ${summary.minor}`,
    `  🟠 Major      : ${summary.major}`,
    `  🔴 Critical   : ${summary.critical}`,
    `  Line mismatches: ${summary.lineCountMismatches}`,
    `  Pass rate     : ${summary.passRate.toFixed(1)}%`,
    '',
  ]

  for (const result of report.results) {
    const icon = SEVERITY_ICON[result.metrics.severity]
    const label = result.sample.label ?? result.sample.text.slice(0, 40)
    lines.push(`${icon} [${result.metrics.severity.toUpperCase()}] ${label}`)
    lines.push(
      `     Pretext lines: ${result.metrics.pretextLineCount}  DOM lines: ${result.metrics.domLineCount}  maxΔ: ${result.metrics.maxLineDelta.toFixed(3)}px  avgΔ: ${result.metrics.averageDelta.toFixed(3)}px`,
    )
    if (result.rootCause !== undefined) {
      lines.push(`     ⚠️  Root cause: ${result.rootCause}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Print the report to console.log.
 */
export function printReport(report: ValidationReport): void {
  console.log(toConsoleText(report))
}
