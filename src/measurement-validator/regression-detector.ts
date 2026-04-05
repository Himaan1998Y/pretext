// Regression detector for the measurement-validator.
//
// Compares the current accuracy and benchmark snapshots against the checked-in
// baselines and emits a RegressionReport that the GitHub Actions workflow and
// dashboard server can consume.
//
// Usage:
//   import { detectRegressions } from './regression-detector.js'
//   const report = await detectRegressions(['chrome', 'safari', 'firefox'])

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  AccuracyRegression,
  AccuracySnapshot,
  BenchmarkEntry,
  BenchmarkSnapshot,
  BrowserName,
  PerformanceRegression,
  RegressionReport,
  RegressionSeverity,
} from './types.js'

export type DetectOptions = {
  /**
   * Percent accuracy drop that is flagged as a warning (0-100).
   * Default: any regression (> 0 mismatches that weren't there before).
   */
  accuracyWarnDelta?: number
  /** Percent benchmark slowdown that triggers a warning. Default 10. */
  perfWarnPct?: number
  /** Percent benchmark slowdown that triggers a critical flag. Default 25. */
  perfCriticalPct?: number
  /**
   * Override current accuracy match counts per browser so the detector can
   * compare live browser-checker results against the checked-in baseline.
   * When omitted the detector compares the checked-in snapshot against itself
   * (always clean) — useful for CI runs that do not have browser access.
   */
  currentAccuracy?: Partial<Record<BrowserName, { matchCount: number; total: number }>>
  /** Repository root. Defaults to two levels above this file. */
  repoRoot?: string
}

function loadJson<T>(path: string): T | null {
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function severityFromAccuracyDelta(delta: number): RegressionSeverity {
  if (delta === 0) return 'ok'
  if (delta < 10) return 'warning'
  return 'critical'
}

function severityFromPerfDelta(
  deltaPct: number,
  warnPct: number,
  criticalPct: number,
): RegressionSeverity {
  if (deltaPct < warnPct) return 'ok'
  if (deltaPct < criticalPct) return 'warning'
  return 'critical'
}

function collectEntries(snapshot: BenchmarkSnapshot): BenchmarkEntry[] {
  return [
    ...(snapshot.results ?? []),
    ...(snapshot.richResults ?? []),
    ...(snapshot.richInlineResults ?? []),
    ...(snapshot.richPreWrapResults ?? []),
    ...(snapshot.richLongResults ?? []),
  ]
}

/**
 * Compare the current accuracy and benchmark snapshots against the checked-in
 * baseline data and return a RegressionReport.
 *
 * Accuracy baseline comes from `accuracy/<browser>.json` (the files checked
 * into the repo). Performance baseline comes from `.measurement-baseline.json`
 * (written by `writeBaseline()` in performance-tracker.ts).
 */
export async function detectRegressions(
  browsers: BrowserName[],
  options: DetectOptions = {},
): Promise<RegressionReport> {
  const {
    accuracyWarnDelta = 0,
    perfWarnPct = 10,
    perfCriticalPct = 25,
    currentAccuracy,
    repoRoot = join(import.meta.dir, '..', '..'),
  } = options

  const accuracyRegressions: AccuracyRegression[] = []
  const performanceRegressions: PerformanceRegression[] = []

  // Load the performance baseline (may not exist on first run)
  const baselineFile = join(repoRoot, '.measurement-baseline.json')
  const baselineData = loadJson<Record<string, Record<string, number>>>(baselineFile) ?? {}

  for (const browser of browsers) {
    // --- Accuracy ---
    // The checked-in `accuracy/<browser>.json` is the baseline.
    // When `currentAccuracy` is provided (e.g. from a live browser checker run),
    // compare it against the checked-in baseline to detect regressions.
    // When omitted (CI without browser access) no accuracy regression is reported.
    const accuracyPath = join(repoRoot, 'accuracy', `${browser}.json`)
    const baseline = loadJson<AccuracySnapshot>(accuracyPath)
    const current = currentAccuracy?.[browser]
    if (baseline != null && current != null) {
      const delta = baseline.matchCount - current.matchCount
      if (delta > accuracyWarnDelta) {
        accuracyRegressions.push({
          browser,
          baselineMatchCount: baseline.matchCount,
          currentMatchCount: current.matchCount,
          baselineTotal: baseline.total,
          currentTotal: current.total,
          delta,
          severity: severityFromAccuracyDelta(delta),
        })
      }
    }

    // --- Performance ---
    const benchmarkPath = join(repoRoot, 'benchmarks', `${browser}.json`)
    const benchmark = loadJson<BenchmarkSnapshot>(benchmarkPath)
    if (benchmark != null) {
      const browserBaseline = baselineData[browser] ?? {}
      const entries = collectEntries(benchmark)
      for (const entry of entries) {
        const baselineMs = browserBaseline[entry.label]
        if (baselineMs == null) continue
        const deltaPct = baselineMs === 0 ? 0 : ((entry.ms - baselineMs) / baselineMs) * 100
        const severity = severityFromPerfDelta(deltaPct, perfWarnPct, perfCriticalPct)
        if (severity !== 'ok') {
          performanceRegressions.push({
            label: entry.label,
            browser,
            baselineMs,
            currentMs: entry.ms,
            deltaPct,
            severity,
          })
        }
      }
    }
  }

  const hasBlocker =
    accuracyRegressions.some(r => r.severity === 'critical') ||
    performanceRegressions.some(r => r.severity === 'critical')

  return {
    generatedAt: new Date().toISOString(),
    accuracyRegressions,
    performanceRegressions,
    hasBlocker,
  }
}

/**
 * Format a RegressionReport as a human-readable text summary.
 */
export function formatRegressionReport(report: RegressionReport): string {
  const lines: string[] = [`Regression report — ${report.generatedAt}`, '']

  if (report.accuracyRegressions.length === 0 && report.performanceRegressions.length === 0) {
    lines.push('✅ No regressions detected')
    return lines.join('\n')
  }

  if (report.accuracyRegressions.length > 0) {
    lines.push('Accuracy regressions:')
    for (const r of report.accuracyRegressions) {
      const icon = r.severity === 'critical' ? '❌' : '⚠️'
      lines.push(
        `  ${icon} ${r.browser}: ${r.currentMatchCount}/${r.currentTotal} matches ` +
          `(was ${r.baselineMatchCount}/${r.baselineTotal}, Δ−${r.delta})`,
      )
    }
    lines.push('')
  }

  if (report.performanceRegressions.length > 0) {
    lines.push('Performance regressions:')
    for (const r of report.performanceRegressions) {
      const icon = r.severity === 'critical' ? '❌' : '⚠️'
      const sign = r.deltaPct >= 0 ? '+' : ''
      lines.push(
        `  ${icon} [${r.browser}] ${r.label}: ${r.currentMs.toFixed(3)}ms ` +
          `(was ${r.baselineMs.toFixed(3)}ms, ${sign}${r.deltaPct.toFixed(1)}%)`,
      )
    }
  }

  if (report.hasBlocker) {
    lines.push('')
    lines.push('❌ Build should be blocked: critical regression(s) detected')
  }

  return lines.join('\n')
}
