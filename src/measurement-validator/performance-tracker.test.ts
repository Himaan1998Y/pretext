import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  createTrackingSession,
  recordSample,
  finalizeSession,
  buildBaselineEntry,
  createBaseline,
  updateBaselineEntry,
  baselineKey,
  detectRegressions,
  formatRegressionReport,
  loadBaseline,
  saveBaseline,
} from './performance-tracker.js'
import { mkdtempSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PerformanceBaseline, PerformanceMetrics } from './types.js'

describe('createTrackingSession', () => {
  test('creates a session with empty samples', () => {
    const s = createTrackingSession('english', '16px Inter')
    expect(s.language).toBe('english')
    expect(s.font).toBe('16px Inter')
    expect(s.samples).toHaveLength(0)
    expect(s.startedAt).toBeGreaterThan(0)
  })
})

describe('recordSample / finalizeSession', () => {
  test('finalizes empty session with zeros', () => {
    const s = createTrackingSession('english', '16px Inter')
    const m = finalizeSession(s)
    expect(m.measurementCount).toBe(0)
    expect(m.totalMs).toBe(0)
  })

  test('computes averages correctly', () => {
    const s = createTrackingSession('english', '16px Inter')
    recordSample(s, 1.0, 0.1)
    recordSample(s, 2.0, 0.2)
    recordSample(s, 3.0, 0.3)
    const m = finalizeSession(s)
    expect(m.prepareMs).toBeCloseTo(2.0)
    expect(m.layoutMs).toBeCloseTo(0.2)
    expect(m.totalMs).toBeCloseTo(2.2)
    expect(m.measurementCount).toBe(3)
  })
})

describe('buildBaselineEntry', () => {
  test('builds entry with correct stats', () => {
    const s = createTrackingSession('english', '16px Inter')
    for (let i = 1; i <= 10; i++) {
      recordSample(s, i * 0.1, 0.01)
    }
    const entry = buildBaselineEntry(s)
    expect(entry.sampleCount).toBe(10)
    expect(entry.avgTotalMs).toBeGreaterThan(0)
    expect(entry.p95TotalMs).toBeGreaterThanOrEqual(entry.avgTotalMs)
  })

  test('empty session returns zeros', () => {
    const s = createTrackingSession('arabic', '16px Inter')
    const entry = buildBaselineEntry(s)
    expect(entry.sampleCount).toBe(0)
    expect(entry.avgTotalMs).toBe(0)
    expect(entry.p95TotalMs).toBe(0)
  })
})

describe('detectRegressions', () => {
  function makeBaseline(avgTotal: number): PerformanceBaseline {
    const b = createBaseline()
    updateBaselineEntry(b, baselineKey('english', '16px Inter'), {
      avgPrepareMs: avgTotal * 0.9,
      avgLayoutMs: avgTotal * 0.1,
      avgTotalMs: avgTotal,
      p95PrepareMs: avgTotal * 1.2,
      p95LayoutMs: avgTotal * 0.15,
      p95TotalMs: avgTotal * 1.3,
      sampleCount: 20,
      capturedAt: Date.now(),
    })
    return b
  }

  function makeMetrics(total: number): PerformanceMetrics {
    return {
      language: 'english',
      font: '16px Inter',
      prepareMs: total * 0.9,
      layoutMs: total * 0.1,
      totalMs: total,
      measurementCount: 10,
      avgMsPerMeasurement: total,
    }
  }

  test('no regressions when performance is similar', () => {
    const baseline = makeBaseline(1.0)
    const current = [makeMetrics(1.05)] // +5% — below 20% threshold
    const r = detectRegressions(current, baseline)
    expect(r).toHaveLength(0)
  })

  test('detects warning regression at 20%+', () => {
    const baseline = makeBaseline(1.0)
    const current = [makeMetrics(1.25)] // +25%
    const r = detectRegressions(current, baseline)
    const warnings = r.filter((x) => x.severity === 'warning')
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]!.language).toBe('english')
  })

  test('detects critical regression at 50%+', () => {
    const baseline = makeBaseline(1.0)
    const current = [makeMetrics(1.6)] // +60%
    const r = detectRegressions(current, baseline)
    const critical = r.filter((x) => x.severity === 'critical')
    expect(critical.length).toBeGreaterThan(0)
  })

  test('no regressions when baseline has zero values', () => {
    const b = createBaseline()
    updateBaselineEntry(b, baselineKey('english', '16px Inter'), {
      avgPrepareMs: 0, avgLayoutMs: 0, avgTotalMs: 0,
      p95PrepareMs: 0, p95LayoutMs: 0, p95TotalMs: 0,
      sampleCount: 0, capturedAt: Date.now(),
    })
    const r = detectRegressions([makeMetrics(2.0)], b)
    expect(r).toHaveLength(0)
  })

  test('skips languages not in baseline', () => {
    const baseline = makeBaseline(1.0)
    const r = detectRegressions(
      [{ ...makeMetrics(5.0), language: 'chinese', font: '16px Inter' }],
      baseline,
    )
    expect(r).toHaveLength(0)
  })
})

describe('formatRegressionReport', () => {
  test('includes passed message when no regressions', () => {
    const report = formatRegressionReport([], [], null)
    expect(report).toContain('No performance regressions detected')
  })

  test('includes regression details', () => {
    const regressions = [
      {
        language: 'arabic',
        metric: 'avgTotalMs' as const,
        baselineMs: 1.0,
        currentMs: 2.0,
        changePercent: 100,
        severity: 'critical' as const,
      },
    ]
    const report = formatRegressionReport(regressions, [], null)
    expect(report).toContain('arabic')
    expect(report).toContain('CRITICAL')
  })
})

describe('loadBaseline / saveBaseline', () => {
  let tmpPath: string

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'baseline-test-'))
    tmpPath = join(dir, 'baseline.json')
  })

  afterEach(() => {
    if (existsSync(tmpPath)) unlinkSync(tmpPath)
  })

  test('returns null for missing file', () => {
    expect(loadBaseline('/nonexistent/path.json')).toBeNull()
  })

  test('round-trips baseline data', () => {
    const b = createBaseline('abc123')
    updateBaselineEntry(b, 'english::16px Inter', {
      avgPrepareMs: 1.0, avgLayoutMs: 0.1, avgTotalMs: 1.1,
      p95PrepareMs: 1.5, p95LayoutMs: 0.15, p95TotalMs: 1.65,
      sampleCount: 50, capturedAt: Date.now(),
    })
    saveBaseline(b, tmpPath)
    const loaded = loadBaseline(tmpPath)
    expect(loaded).not.toBeNull()
    expect(loaded!.commitSha).toBe('abc123')
    expect(loaded!.metrics['english::16px Inter']!.avgTotalMs).toBeCloseTo(1.1)
  })
})
