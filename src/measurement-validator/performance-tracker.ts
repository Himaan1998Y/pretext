// Performance tracking for the measurement-validator.
//
// Tracks timing metrics per language/font combination and compares against
// a version-controlled baseline file. Regression detection flags changes
// beyond configurable thresholds.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type {
  BaselineEntry,
  PerformanceBaseline,
  PerformanceMetrics,
  PerformanceRegression,
} from './types.js'

const REGRESSION_WARNING_THRESHOLD = 0.20 // 20% slower = warning
const REGRESSION_CRITICAL_THRESHOLD = 0.50 // 50% slower = critical
const DEFAULT_BASELINE_PATH = '.measurement-baseline.json'

export type TrackingSession = {
  language: string
  font: string
  samples: Array<{ prepareMs: number; layoutMs: number }>
  startedAt: number
}

export function createTrackingSession(language: string, font: string): TrackingSession {
  return { language, font, samples: [], startedAt: Date.now() }
}

export function recordSample(
  session: TrackingSession,
  prepareMs: number,
  layoutMs: number,
): void {
  session.samples.push({ prepareMs, layoutMs })
}

export function finalizeSession(session: TrackingSession): PerformanceMetrics {
  const { language, font, samples } = session
  if (samples.length === 0) {
    return {
      language,
      font,
      prepareMs: 0,
      layoutMs: 0,
      totalMs: 0,
      measurementCount: 0,
      avgMsPerMeasurement: 0,
    }
  }
  const avgPrepare = samples.reduce((s, x) => s + x.prepareMs, 0) / samples.length
  const avgLayout = samples.reduce((s, x) => s + x.layoutMs, 0) / samples.length
  const avgTotal = avgPrepare + avgLayout
  return {
    language,
    font,
    prepareMs: avgPrepare,
    layoutMs: avgLayout,
    totalMs: avgTotal,
    measurementCount: samples.length,
    avgMsPerMeasurement: avgTotal,
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!
}

export function buildBaselineEntry(session: TrackingSession): BaselineEntry {
  const totals = session.samples.map((s) => s.prepareMs + s.layoutMs).sort((a, b) => a - b)
  const prepares = session.samples.map((s) => s.prepareMs).sort((a, b) => a - b)
  const layouts = session.samples.map((s) => s.layoutMs).sort((a, b) => a - b)
  const n = session.samples.length
  return {
    avgPrepareMs: n > 0 ? prepares.reduce((s, x) => s + x, 0) / n : 0,
    avgLayoutMs: n > 0 ? layouts.reduce((s, x) => s + x, 0) / n : 0,
    avgTotalMs: n > 0 ? totals.reduce((s, x) => s + x, 0) / n : 0,
    p95PrepareMs: percentile(prepares, 95),
    p95LayoutMs: percentile(layouts, 95),
    p95TotalMs: percentile(totals, 95),
    sampleCount: n,
    capturedAt: Date.now(),
  }
}

export function loadBaseline(path: string = DEFAULT_BASELINE_PATH): PerformanceBaseline | null {
  try {
    if (!existsSync(path)) return null
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as PerformanceBaseline
  } catch {
    return null
  }
}

export function saveBaseline(
  baseline: PerformanceBaseline,
  path: string = DEFAULT_BASELINE_PATH,
): void {
  baseline.updatedAt = Date.now()
  writeFileSync(path, JSON.stringify(baseline, null, 2) + '\n', 'utf-8')
}

export function createBaseline(commitSha?: string): PerformanceBaseline {
  return {
    version: '1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    commitSha,
    metrics: {},
  }
}

export function updateBaselineEntry(
  baseline: PerformanceBaseline,
  key: string,
  entry: BaselineEntry,
): void {
  baseline.metrics[key] = entry
  baseline.updatedAt = Date.now()
}

export function baselineKey(language: string, font: string): string {
  return `${language}::${font}`
}

export function detectRegressions(
  current: PerformanceMetrics[],
  baseline: PerformanceBaseline,
  warningThreshold: number = REGRESSION_WARNING_THRESHOLD,
  criticalThreshold: number = REGRESSION_CRITICAL_THRESHOLD,
): PerformanceRegression[] {
  const regressions: PerformanceRegression[] = []
  for (const metrics of current) {
    const key = baselineKey(metrics.language, metrics.font)
    const base = baseline.metrics[key]
    if (!base) continue

    const checks: Array<{
      metric: keyof Pick<BaselineEntry, 'avgTotalMs' | 'p95TotalMs'>
      baseline: number
      current: number
    }> = [
      { metric: 'avgTotalMs', baseline: base.avgTotalMs, current: metrics.totalMs },
      { metric: 'p95TotalMs', baseline: base.p95TotalMs, current: metrics.totalMs },
    ]

    for (const check of checks) {
      if (check.baseline <= 0) continue
      const change = (check.current - check.baseline) / check.baseline
      if (change >= criticalThreshold) {
        regressions.push({
          language: metrics.language,
          metric: check.metric,
          baselineMs: check.baseline,
          currentMs: check.current,
          changePercent: change * 100,
          severity: 'critical',
        })
      } else if (change >= warningThreshold) {
        regressions.push({
          language: metrics.language,
          metric: check.metric,
          baselineMs: check.baseline,
          currentMs: check.current,
          changePercent: change * 100,
          severity: 'warning',
        })
      }
    }
  }
  return regressions
}

export function formatRegressionReport(
  regressions: PerformanceRegression[],
  current: PerformanceMetrics[],
  baseline: PerformanceBaseline | null,
): string {
  const lines: string[] = ['# Performance Report\n']

  if (baseline) {
    lines.push(
      `Baseline captured: ${new Date(baseline.updatedAt).toISOString()}`,
      baseline.commitSha ? `Baseline commit: ${baseline.commitSha}` : '',
      '',
    )
  }

  lines.push('## Current Metrics\n')
  for (const m of current) {
    const key = baselineKey(m.language, m.font)
    const base = baseline?.metrics[key]
    const change = base && base.avgTotalMs > 0
      ? ((m.totalMs - base.avgTotalMs) / base.avgTotalMs * 100).toFixed(1)
      : null
    const trend = change !== null
      ? (Number(change) > 0 ? ` (+${change}%)` : ` (${change}%)`)
      : ' (no baseline)'
    lines.push(`- **${m.language}** ${m.font}: ${m.totalMs.toFixed(2)}ms avg${trend}`)
  }

  if (regressions.length > 0) {
    lines.push('\n## ⚠️ Regressions Detected\n')
    for (const r of regressions) {
      const icon = r.severity === 'critical' ? '🔴' : '🟡'
      lines.push(
        `${icon} **${r.language}** (${r.metric}): ` +
        `${r.baselineMs.toFixed(2)}ms → ${r.currentMs.toFixed(2)}ms ` +
        `(+${r.changePercent.toFixed(1)}%) [${r.severity.toUpperCase()}]`,
      )
    }
  } else {
    lines.push('\n✅ No performance regressions detected.')
  }

  return lines.filter((l) => l !== '').join('\n')
}
