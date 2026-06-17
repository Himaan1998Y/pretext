/**
 * Report Generator
 */

import type { MeasurementResult } from './types.js'

export function generateJSONReport(results: MeasurementResult[]): string {
  return JSON.stringify(results, null, 2)
}

export function generateConsoleSummary(results: MeasurementResult[]): string {
  const total = results.length
  const passed = results.filter((r) => r.overallSeverity === 'pass').length
  const warnings = results.filter((r) => r.overallSeverity === 'warning').length
  const errors = results.filter((r) => r.overallSeverity === 'error').length
  const critical = results.filter((r) => r.overallSeverity === 'critical').length

  const passRate = total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00'

  return `
╔═══════════════════════════════════════════════════════════╗
║          MEASUREMENT VALIDATOR REPORT SUMMARY             ║
╚═══════════════════════════════════════════════════════════╝

Total Samples: ${total}
  ✅ Passed:    ${passed}
  ⚠️  Warnings: ${warnings}
  ❌ Errors:    ${errors}
  🔴 Critical:  ${critical}

Pass Rate: ${passRate}%
`.trim()
}

export function generateDetailedReport(results: MeasurementResult[]): string {
  let report = generateConsoleSummary(results) + '\n\n'

  for (const result of results) {
    report += `\n${'─'.repeat(60)}\n`
    report += `Sample: ${result.sample.text.substring(0, 40)}\n`
    report += `Font: ${result.sample.font}\n`
    report += `Severity: ${result.overallSeverity.toUpperCase()}\n`
    report += `Time: ${result.executionTimeMs.toFixed(2)}ms\n`

    if (result.lines.length > 0) {
      report += `\nLine Details:\n`
      for (const line of result.lines) {
        const icon =
          line.severity === 'exact'
            ? '✅'
            : line.severity === 'minor'
              ? '⚠️'
              : line.severity === 'major'
                ? '❌'
                : '🔴'
        report += `  ${icon} Line ${line.index}: Δ${line.delta.toFixed(2)}px\n`
      }
    }
  }

  return report
}

export function generateLanguageBreakdown(results: MeasurementResult[]): string {
  const bySeverity: Record<string, number> = {
    pass: 0,
    warning: 0,
    error: 0,
    critical: 0,
  }

  for (const result of results) {
    const key = result.overallSeverity
    bySeverity[key] = (bySeverity[key] ?? 0) + 1
  }

  let report = 'Language/Sample Breakdown:\n'
  report += `  pass: ${bySeverity['pass'] ?? 0}\n`
  report += `  warning: ${bySeverity['warning'] ?? 0}\n`
  report += `  error: ${bySeverity['error'] ?? 0}\n`
  report += `  critical: ${bySeverity['critical'] ?? 0}\n`
  return report
}
