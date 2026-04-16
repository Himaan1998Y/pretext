// Regression detector: classifies performance regressions by severity.
// Thresholds: minor < 10%, major < 20%, critical >= 20% slowdown.

import type { RegressionResult, RegressionSeverity } from './types.js'
import type { BaselineComparison } from './performance-tracker.js'

const MINOR_THRESHOLD = 10 // 10%
const MAJOR_THRESHOLD = 20 // 20%
// Values above MAJOR_THRESHOLD * 2 (40%) are classified as critical.

export type RegressionConfig = {
  minorThresholdPct?: number
  majorThresholdPct?: number
}

function classifySeverity(
  changePct: number,
  config: Required<RegressionConfig>
): RegressionSeverity | null {
  if (changePct <= 0) return null // improvement, not a regression
  if (changePct < config.minorThresholdPct) return null // within noise
  if (changePct < config.majorThresholdPct) return 'minor'
  if (changePct < config.majorThresholdPct * 2) return 'major'
  return 'critical'
}

export function detectRegressions(
  comparisons: BaselineComparison[],
  config: RegressionConfig = {}
): RegressionResult[] {
  const cfg: Required<RegressionConfig> = {
    minorThresholdPct: config.minorThresholdPct ?? MINOR_THRESHOLD,
    majorThresholdPct: config.majorThresholdPct ?? MAJOR_THRESHOLD,
  }

  const regressions: RegressionResult[] = []
  for (const c of comparisons) {
    const severity = classifySeverity(c.changePercent, cfg)
    if (!severity) continue

    regressions.push({
      language: c.language,
      metric: c.metric,
      baseline: c.baseline,
      current: c.current,
      changePercent: c.changePercent,
      severity,
      message: formatRegressionMessage(c, severity),
    })
  }

  // Sort by severity: critical first, then major, then minor.
  const ORDER: Record<RegressionSeverity, number> = {
    critical: 0,
    major: 1,
    minor: 2,
  }
  return regressions.sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
}

function formatRegressionMessage(
  c: BaselineComparison,
  severity: RegressionSeverity
): string {
  const dir = c.changePercent > 0 ? '+' : ''
  return (
    `[${severity.toUpperCase()}] ${c.language} ${c.metric}: ` +
    `${c.baseline.toFixed(2)}ms → ${c.current.toFixed(2)}ms ` +
    `(${dir}${c.changePercent.toFixed(1)}%)`
  )
}

export function hasCriticalRegressions(regressions: RegressionResult[]): boolean {
  return regressions.some((r) => r.severity === 'critical')
}

export function summarizeRegressions(regressions: RegressionResult[]): string {
  if (regressions.length === 0) return 'No performance regressions detected.'
  const criticals = regressions.filter((r) => r.severity === 'critical').length
  const majors = regressions.filter((r) => r.severity === 'major').length
  const minors = regressions.filter((r) => r.severity === 'minor').length
  const parts: string[] = []
  if (criticals > 0) parts.push(`${criticals} critical`)
  if (majors > 0) parts.push(`${majors} major`)
  if (minors > 0) parts.push(`${minors} minor`)
  return `Performance regressions detected: ${parts.join(', ')}.`
}
