// Performance tracker: calculates per-language metrics from measurement results.
// Supports baseline comparison with percentage change tracking.

import type {
  BaselineEntry,
  Language,
  MeasurementResult,
  PerformanceMetrics,
} from './types.js'

function sortedValues(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  const frac = idx - lo
  return (sorted[lo]! * (1 - frac)) + (sorted[hi]! * frac)
}

function median(sorted: number[]): number {
  return percentile(sorted, 50)
}

export function computeMetrics(results: MeasurementResult[]): PerformanceMetrics[] {
  const byLanguage = new Map<Language, number[]>()

  for (const r of results) {
    let arr = byLanguage.get(r.language)
    if (!arr) {
      arr = []
      byLanguage.set(r.language, arr)
    }
    arr.push(r.durationMs)
  }

  return Array.from(byLanguage.entries()).map(([language, durations]) => {
    const sorted = sortedValues(durations)
    const sum = sorted.reduce((a, b) => a + b, 0)
    return {
      language,
      sampleCount: sorted.length,
      avgMs: sorted.length > 0 ? sum / sorted.length : 0,
      minMs: sorted[0] ?? 0,
      maxMs: sorted[sorted.length - 1] ?? 0,
      medianMs: median(sorted),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
    }
  })
}

export function metricsToBaseline(
  metrics: PerformanceMetrics[],
  results: MeasurementResult[],
  version: string
): BaselineEntry[] {
  const passRateMap = new Map<Language, { total: number; passed: number }>()
  for (const r of results) {
    let entry = passRateMap.get(r.language)
    if (!entry) {
      entry = { total: 0, passed: 0 }
      passRateMap.set(r.language, entry)
    }
    entry.total++
    if (r.severity === 'pass') entry.passed++
  }

  const now = Date.now()
  return metrics.map((m) => {
    const pr = passRateMap.get(m.language)
    return {
      language: m.language,
      avgMs: m.avgMs,
      p95Ms: m.p95Ms,
      p99Ms: m.p99Ms,
      passRate: pr && pr.total > 0 ? pr.passed / pr.total : 1,
      recordedAt: now,
      version,
    }
  })
}

export type BaselineComparison = {
  language: Language
  metric: 'avgMs' | 'p95Ms' | 'p99Ms'
  baseline: number
  current: number
  changePercent: number
}

export function compareToBaseline(
  current: PerformanceMetrics[],
  baseline: BaselineEntry[]
): BaselineComparison[] {
  const baselineMap = new Map<Language, BaselineEntry>(
    baseline.map((b) => [b.language, b])
  )

  const comparisons: BaselineComparison[] = []
  for (const m of current) {
    const b = baselineMap.get(m.language)
    if (!b) continue

    for (const key of ['avgMs', 'p95Ms', 'p99Ms'] as const) {
      const base = b[key]
      const curr = m[key]
      if (base === 0) continue
      comparisons.push({
        language: m.language,
        metric: key,
        baseline: base,
        current: curr,
        changePercent: ((curr - base) / base) * 100,
      })
    }
  }
  return comparisons
}
