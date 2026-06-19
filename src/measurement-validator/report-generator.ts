// Report generator: formats MeasurementResult and TestSuiteReport output.
//
// Supports two output modes:
//   - JSON: structured machine-readable output for CI/tooling integration
//   - console: human-readable summary for interactive inspection

import type {
  DivergenceAnalysis,
  LanguageGroupStats,
  MeasurementResult,
  TestSuiteReport,
} from './types.js'

// --- Severity formatting helpers ---

const SEVERITY_ICONS: Record<string, string> = {
  pass: '✅',
  minor: '⚠️',
  major: '🟠',
  critical: '🔴',
}

function severityIcon(severity: string): string {
  return SEVERITY_ICONS[severity] ?? '❓'
}

// --- Single result report ---

export function formatResultJSON(result: MeasurementResult): string {
  return JSON.stringify(result, null, 2)
}

export function formatResultConsole(result: MeasurementResult): string {
  const lines: string[] = []
  const icon = severityIcon(result.overallSeverity)

  lines.push(`${icon} ${result.overallSeverity.toUpperCase()} — "${result.sample.text.slice(0, 40)}"`)
  lines.push(
    `   font=${result.sample.font} width=${result.sample.maxWidth}px  ` +
      `passRate=${(result.passRate * 100).toFixed(1)}%  maxDelta=${result.maxDelta.toFixed(3)}px  ` +
      `${result.durationMs}ms`,
  )

  if (!result.lineCountMatch) {
    lines.push(
      `   ⚠ line count mismatch: pretext=${result.pretextLineCount} dom=${result.domLineCount}`,
    )
  }

  for (const pair of result.lines) {
    if (pair.severity !== 'pass') {
      lines.push(
        `   line ${pair.lineIndex}: delta=${pair.delta.toFixed(3)}px  ` +
          `pretext="${pair.pretextText.slice(0, 30)}"  dom="${pair.domText.slice(0, 30)}"`,
      )
    }
  }

  return lines.join('\n')
}

// --- Divergence analysis report ---

export function formatDivergenceConsole(analysis: DivergenceAnalysis): string {
  if (!analysis.detected) return '✅ No divergence detected.'
  const icon = severityIcon(analysis.severity)
  return [
    `${icon} Divergence: ${analysis.rootCause ?? 'unknown'} (confidence=${(analysis.confidence * 100).toFixed(0)}%)`,
    `   → ${analysis.recommendation}`,
  ].join('\n')
}

// --- Test suite report ---

export function formatSuiteJSON(report: TestSuiteReport): string {
  return JSON.stringify(report, null, 2)
}

export function formatSuiteConsole(report: TestSuiteReport): string {
  const lines: string[] = []
  const icon = report.overallPassRate >= 0.99 ? '✅' : report.overallPassRate >= 0.8 ? '⚠️' : '🔴'

  lines.push(
    `${icon} Test Suite — ${report.totalPassed}/${report.totalSamples} passed ` +
      `(${(report.overallPassRate * 100).toFixed(1)}%)  ${report.durationMs}ms`,
  )

  for (const grp of report.byLanguageGroup) {
    lines.push(formatGroupStatsConsole(grp))
  }

  const critical = report.results.filter((r) => r.overallSeverity === 'critical')
  if (critical.length > 0) {
    lines.push(`\n🔴 Critical failures (${critical.length}):`)
    for (const r of critical) {
      lines.push(`  • "${r.sample.text.slice(0, 50)}" (${r.sample.font}, ${r.sample.maxWidth}px)`)
    }
  }

  return lines.join('\n')
}

function formatGroupStatsConsole(stats: LanguageGroupStats): string {
  const icon = stats.passRate >= 0.99 ? '✅' : stats.passRate >= 0.8 ? '⚠️' : '🔴'
  return (
    `  ${icon} ${stats.group.padEnd(16)} ` +
    `${stats.passed}/${stats.total}  ` +
    `passRate=${(stats.passRate * 100).toFixed(1)}%  ` +
    `avgDelta=${stats.averageDelta.toFixed(3)}px  ` +
    `maxDelta=${stats.maxDelta.toFixed(3)}px`
  )
}

// --- Aggregate helpers used by test-suite.ts ---

export function buildGroupStats(
  group: string,
  results: MeasurementResult[],
): LanguageGroupStats {
  const total = results.length
  const passed = results.filter((r) => r.overallSeverity === 'pass').length
  const deltas = results.flatMap((r) => r.lines.map((l) => Math.abs(l.delta)))
  const maxDelta = deltas.length > 0 ? Math.max(...deltas) : 0
  const averageDelta = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0

  return {
    group: group as import('./types.js').LanguageGroup,
    total,
    passed,
    passRate: total > 0 ? passed / total : 1,
    averageDelta,
    maxDelta,
  }
}
