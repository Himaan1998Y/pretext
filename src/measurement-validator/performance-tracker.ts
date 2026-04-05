// Performance tracker for the measurement-validator.
//
// Loads benchmark snapshots from the checked-in `benchmarks/` directory,
// compares each entry against a baseline, and emits a structured
// PerformanceReport showing deltas and trend labels.
//
// Usage:
//   import { trackPerformance } from './performance-tracker.js'
//   const report = await trackPerformance('chrome', { warnPct: 10, criticalPct: 25 })

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  BenchmarkEntry,
  BenchmarkSnapshot,
  BrowserName,
  PerformanceMetrics,
  PerformanceReport,
} from './types.js'

export type TrackOptions = {
  /** Percent increase that triggers a 'degrading' label. Default 10. */
  warnPct?: number
  /** Percent increase that counts as a regression in the report count. Default 25. */
  criticalPct?: number
  /**
   * Root of the repository. Defaults to two levels up from this file so it
   * works whether the code is run from source or from `dist/`.
   */
  repoRoot?: string
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

function loadSnapshot(repoRoot: string, browser: BrowserName): BenchmarkSnapshot {
  const filePath = join(repoRoot, 'benchmarks', `${browser}.json`)
  const raw = readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as BenchmarkSnapshot
}

function loadBaseline(repoRoot: string, browser: BrowserName): Map<string, number> {
  const baselineFile = join(repoRoot, '.measurement-baseline.json')
  try {
    const raw = readFileSync(baselineFile, 'utf-8')
    const data = JSON.parse(raw) as Record<string, Record<string, number>>
    const browserData = data[browser]
    if (browserData == null) return new Map()
    return new Map(Object.entries(browserData))
  } catch {
    return new Map()
  }
}

function classifyTrend(
  deltaPct: number,
  warnPct: number,
): PerformanceMetrics['trend'] {
  if (deltaPct <= -1) return 'improving'
  if (deltaPct >= warnPct) return 'degrading'
  return 'stable'
}

/**
 * Load the benchmark snapshot for `browser`, compare each entry against the
 * checked-in baseline (if any), and return a PerformanceReport.
 */
export async function trackPerformance(
  browser: BrowserName,
  options: TrackOptions = {},
): Promise<PerformanceReport> {
  const {
    warnPct = 10,
    criticalPct = 25,
    repoRoot = join(import.meta.dir, '..', '..'),
  } = options

  const snapshot = loadSnapshot(repoRoot, browser)
  const baseline = loadBaseline(repoRoot, browser)

  const entries = collectEntries(snapshot)
  const metrics: PerformanceMetrics[] = entries.map(entry => {
    const baselineMs = baseline.get(entry.label) ?? entry.ms
    const deltaMs = entry.ms - baselineMs
    const deltaPct = baselineMs === 0 ? 0 : (deltaMs / baselineMs) * 100
    return {
      label: entry.label,
      baselineMs,
      currentMs: entry.ms,
      deltaMs,
      deltaPct,
      trend: classifyTrend(deltaPct, warnPct),
    }
  })

  const regressionCount = metrics.filter(m => m.deltaPct >= criticalPct).length

  return {
    generatedAt: new Date().toISOString(),
    browser,
    metrics,
    regressionCount,
  }
}

/**
 * Write a new baseline file from the current benchmark snapshots.
 * Call this after a clean run to lock in today's numbers as the reference.
 */
export async function writeBaseline(
  browsers: BrowserName[],
  options: Pick<TrackOptions, 'repoRoot'> = {},
): Promise<void> {
  const { repoRoot = join(import.meta.dir, '..', '..') } = options
  const baseline: Record<string, Record<string, number>> = {}

  for (const browser of browsers) {
    try {
      const snapshot = loadSnapshot(repoRoot, browser)
      const entries = collectEntries(snapshot)
      baseline[browser] = Object.fromEntries(entries.map(e => [e.label, e.ms]))
    } catch {
      // Skip browsers whose snapshot is not present.
    }
  }

  const baselineFile = join(repoRoot, '.measurement-baseline.json')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(baselineFile, JSON.stringify(baseline, null, 2) + '\n', 'utf-8')
}

/**
 * Format a PerformanceReport as a human-readable text block suitable for
 * console output or Slack messages.
 */
export function formatPerformanceReport(report: PerformanceReport): string {
  const lines: string[] = [
    `Performance report — ${report.browser} — ${report.generatedAt}`,
    '',
  ]
  for (const m of report.metrics) {
    const sign = m.deltaMs >= 0 ? '+' : ''
    const icon = m.trend === 'improving' ? '✅' : m.trend === 'degrading' ? '⚠️' : '✅'
    lines.push(
      `  ${icon} ${m.label}: ${m.currentMs.toFixed(3)}ms (${sign}${m.deltaPct.toFixed(1)}%)`,
    )
  }
  if (report.regressionCount > 0) {
    lines.push('')
    lines.push(`⚠️  ${report.regressionCount} regression(s) detected`)
  }
  return lines.join('\n')
}
