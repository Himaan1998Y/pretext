import { describe, expect, test } from 'bun:test'

import { compareMeasurement, validateSamples } from './comparator.js'
import {
  analyzeDivergence,
  analyzeAll,
  buildLanguageBreakdown,
  buildSummary,
} from './classifier.js'
import { exportToCsv } from './csv-exporter.js'
import { exportToMarkdown } from './markdown-exporter.js'
import { exportToHtml } from './html-report.js'
import { computeMetrics, metricsToBaseline, compareToBaseline } from './performance-tracker.js'
import {
  detectRegressions,
  hasCriticalRegressions,
  summarizeRegressions,
} from './regression-detector.js'
import { MeasurementDatabase } from './database.js'
import type { MeasurementResult } from './types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<MeasurementResult> = {}): MeasurementResult {
  return compareMeasurement(
    overrides.text ?? 'Hello world',
    overrides.language ?? 'en',
    overrides.font ?? 'system-ui',
    overrides.fontSize ?? 16,
    overrides.containerWidth ?? 300,
    overrides.canvasLineCount ?? 1,
    overrides.domLineCount ?? 1,
    overrides.durationMs ?? 0.5
  )
}

function makeDivergedResult(extra: Partial<MeasurementResult> = {}): MeasurementResult {
  return compareMeasurement(
    extra.text ?? 'Hello world',
    extra.language ?? 'en',
    extra.font ?? 'system-ui',
    extra.fontSize ?? 16,
    extra.containerWidth ?? 300,
    extra.canvasLineCount ?? 1,
    extra.domLineCount ?? 2, // line count mismatch → divergence
    extra.durationMs ?? 0.5
  )
}

// ---------------------------------------------------------------------------
// Comparator
// ---------------------------------------------------------------------------

describe('comparator', () => {
  test('returns pass for matching line counts', () => {
    const r = makeResult()
    expect(r.diverged).toBe(false)
    expect(r.severity).toBe('pass')
    expect(r.divergencePixels).toBe(0)
  })

  test('returns critical for line count mismatch', () => {
    const r = compareMeasurement('text', 'en', 'system-ui', 16, 300, 1, 3, 0)
    expect(r.diverged).toBe(true)
    expect(r.severity).toBe('critical')
    expect(r.divergencePixels).toBeGreaterThan(0)
  })

  test('classifies emoji text reason', () => {
    const r = compareMeasurement('Hello 😊', 'en', 'system-ui', 16, 300, 1, 2, 0)
    expect(r.reason).toBe('emoji_width')
  })

  test('classifies arabic text as bidi_reorder on divergence', () => {
    const r = compareMeasurement('مرحبا', 'ar', 'system-ui', 16, 300, 1, 2, 0)
    expect(r.reason).toBe('bidi_reorder')
  })

  test('classifies tab as tab_width reason', () => {
    const r = compareMeasurement('a\tb', 'en', 'system-ui', 16, 300, 1, 2, 0)
    expect(r.reason).toBe('tab_width')
  })

  test('validateSamples processes multiple samples', async () => {
    const results = await validateSamples([
      { text: 'Hello', language: 'en', canvasLineCount: 1, domLineCount: 1 },
      { text: 'World', language: 'en', canvasLineCount: 1, domLineCount: 1 },
    ])
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.severity === 'pass')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

describe('classifier', () => {
  test('analyzeDivergence returns reason details and suggestion', () => {
    const r = makeDivergedResult()
    const analysis = analyzeDivergence(r)
    expect(analysis.details).toBeTruthy()
    expect(analysis.suggestion).toBeTruthy()
    expect(analysis.result).toBe(r)
  })

  test('analyzeAll only returns diverged results', () => {
    const pass = makeResult()
    const diverged = makeDivergedResult()
    const analyses = analyzeAll([pass, diverged])
    expect(analyses).toHaveLength(1)
    expect(analyses[0]!.result).toBe(diverged)
  })

  test('buildLanguageBreakdown aggregates correctly', () => {
    const results = [
      makeResult({ language: 'en' }),
      makeDivergedResult({ language: 'en' }),
      makeResult({ language: 'ar' }),
    ]
    const breakdown = buildLanguageBreakdown(results)
    const en = breakdown.find((b) => b.language === 'en')!
    expect(en.total).toBe(2)
    expect(en.passed).toBe(1)
    const ar = breakdown.find((b) => b.language === 'ar')!
    expect(ar.passRate).toBe(1)
  })

  test('buildSummary totals match individual counts', () => {
    const results = [makeResult(), makeDivergedResult(), makeDivergedResult()]
    const summary = buildSummary(results, 100)
    expect(summary.total).toBe(3)
    expect(summary.passed + summary.warnings + summary.criticals).toBe(3)
    expect(summary.durationMs).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// CSV exporter
// ---------------------------------------------------------------------------

describe('csv-exporter', () => {
  test('produces BOM-prefixed UTF-8 CSV', () => {
    const r = makeResult()
    const csv = exportToCsv([r])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Language')
    expect(csv).toContain('en')
  })

  test('escapes commas and quotes in text field', () => {
    const r = makeResult({ text: 'Hello, "world"' })
    const csv = exportToCsv([r])
    // The text field should be wrapped in double-quotes with inner quotes doubled.
    expect(csv).toContain('"Hello, ""world"""')
  })

  test('produces correct number of data rows', () => {
    const results = [makeResult(), makeResult(), makeResult()]
    const csv = exportToCsv(results)
    const lines = csv.trim().split('\n')
    // 1 header + 3 data rows
    expect(lines).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// Markdown exporter
// ---------------------------------------------------------------------------

describe('markdown-exporter', () => {
  test('produces summary table', () => {
    const r = makeResult()
    const md = exportToMarkdown([r])
    expect(md).toContain('## Summary')
    expect(md).toContain('Pass rate')
  })

  test('includes divergences section only when there are divergences', () => {
    const pass = makeResult()
    const diverged = makeDivergedResult()
    expect(exportToMarkdown([pass])).not.toContain('## Divergences')
    expect(exportToMarkdown([diverged])).toContain('## Divergences')
  })

  test('includes by-language breakdown', () => {
    const results = [makeResult({ language: 'ar' }), makeResult({ language: 'en' })]
    const md = exportToMarkdown(results)
    expect(md).toContain('## By Language')
    expect(md).toContain('ar')
    expect(md).toContain('en')
  })
})

// ---------------------------------------------------------------------------
// HTML report
// ---------------------------------------------------------------------------

describe('html-report', () => {
  test('produces valid HTML structure', () => {
    const r = makeResult()
    const html = exportToHtml([r])
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Measurement Validation Report')
    expect(html).toContain('<table')
    expect(html).toContain('</table>')
  })

  test('escapes user text in HTML output', () => {
    const r = makeResult({ text: '<script>alert(1)</script>' })
    const html = exportToHtml([r])
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('includes filter controls', () => {
    const html = exportToHtml([makeResult()])
    expect(html).toContain('filter-text')
    expect(html).toContain('filter-lang')
  })
})

// ---------------------------------------------------------------------------
// Performance tracker
// ---------------------------------------------------------------------------

describe('performance-tracker', () => {
  test('computeMetrics calculates correct averages', () => {
    const results: MeasurementResult[] = [
      makeResult({ language: 'en', durationMs: 1.0 }),
      makeResult({ language: 'en', durationMs: 3.0 }),
    ]
    const [m] = computeMetrics(results)
    expect(m!.avgMs).toBeCloseTo(2.0)
    expect(m!.minMs).toBeCloseTo(1.0)
    expect(m!.maxMs).toBeCloseTo(3.0)
    expect(m!.sampleCount).toBe(2)
  })

  test('computeMetrics groups by language', () => {
    const results: MeasurementResult[] = [
      makeResult({ language: 'en', durationMs: 1.0 }),
      makeResult({ language: 'ar', durationMs: 2.0 }),
    ]
    const metrics = computeMetrics(results)
    expect(metrics).toHaveLength(2)
    const langs = metrics.map((m) => m.language).sort()
    expect(langs).toEqual(['ar', 'en'])
  })

  test('compareToBaseline returns change percentages', () => {
    const metrics = [
      {
        language: 'en' as const,
        sampleCount: 1,
        avgMs: 2.0,
        minMs: 2.0,
        maxMs: 2.0,
        medianMs: 2.0,
        p95Ms: 2.0,
        p99Ms: 2.0,
      },
    ]
    const baseline = [
      {
        language: 'en' as const,
        avgMs: 1.0,
        p95Ms: 1.0,
        p99Ms: 1.0,
        passRate: 1.0,
        recordedAt: Date.now(),
        version: '1.0.0',
      },
    ]
    const comparisons = compareToBaseline(metrics, baseline)
    const avgComp = comparisons.find((c) => c.metric === 'avgMs')!
    expect(avgComp.changePercent).toBeCloseTo(100)
  })

  test('metricsToBaseline produces correctly shaped entries', () => {
    const metrics = computeMetrics([makeResult({ language: 'en', durationMs: 1.0 })])
    const entries = metricsToBaseline(metrics, [makeResult({ language: 'en' })], '1.0.0')
    expect(entries).toHaveLength(1)
    expect(entries[0]!.language).toBe('en')
    expect(entries[0]!.version).toBe('1.0.0')
  })
})

// ---------------------------------------------------------------------------
// Regression detector
// ---------------------------------------------------------------------------

describe('regression-detector', () => {
  const makeComparisons = (changePercent: number) => [
    {
      language: 'en' as const,
      metric: 'avgMs' as const,
      baseline: 1.0,
      current: 1.0 * (1 + changePercent / 100),
      changePercent,
    },
  ]

  test('no regression below minor threshold', () => {
    const regressions = detectRegressions(makeComparisons(5))
    expect(regressions).toHaveLength(0)
  })

  test('minor regression between 10% and 20%', () => {
    const regressions = detectRegressions(makeComparisons(15))
    expect(regressions).toHaveLength(1)
    expect(regressions[0]!.severity).toBe('minor')
  })

  test('major regression between 20% and 40%', () => {
    const regressions = detectRegressions(makeComparisons(30))
    expect(regressions).toHaveLength(1)
    expect(regressions[0]!.severity).toBe('major')
  })

  test('critical regression above 40%', () => {
    const regressions = detectRegressions(makeComparisons(50))
    expect(regressions).toHaveLength(1)
    expect(regressions[0]!.severity).toBe('critical')
  })

  test('improvements are not regressions', () => {
    const regressions = detectRegressions(makeComparisons(-20))
    expect(regressions).toHaveLength(0)
  })

  test('hasCriticalRegressions detects criticals', () => {
    const regressions = detectRegressions(makeComparisons(50))
    expect(hasCriticalRegressions(regressions)).toBe(true)
  })

  test('summarizeRegressions produces human-readable message', () => {
    const regressions = detectRegressions(makeComparisons(50))
    const msg = summarizeRegressions(regressions)
    expect(msg).toContain('critical')
  })

  test('empty regressions returns no-regression message', () => {
    expect(summarizeRegressions([])).toContain('No performance regressions')
  })
})

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

describe('database', () => {
  test('insert and query results round-trip', () => {
    const db = new MeasurementDatabase()
    const r = makeResult({ text: 'Test text', language: 'en' })
    db.insertResult(r)
    const all = db.queryAll()
    expect(all.length).toBeGreaterThanOrEqual(1)
    const found = all.find((x) => x.id === r.id)
    expect(found).toBeDefined()
    expect(found!.language).toBe('en')
    db.close()
  })

  test('queryByLanguage filters correctly', () => {
    const db = new MeasurementDatabase()
    db.insertResults([
      makeResult({ language: 'en' }),
      makeResult({ language: 'ar' }),
      makeResult({ language: 'ar' }),
    ])
    const ar = db.queryByLanguage('ar')
    expect(ar.length).toBe(2)
    expect(ar.every((r) => r.language === 'ar')).toBe(true)
    db.close()
  })

  test('queryBySeverity filters by severity', () => {
    const db = new MeasurementDatabase()
    db.insertResult(makeResult())           // pass
    db.insertResult(makeDivergedResult())    // critical
    const criticals = db.queryBySeverity('critical')
    expect(criticals.every((r) => r.severity === 'critical')).toBe(true)
    db.close()
  })

  test('queryRecent returns at most limit results', () => {
    const db = new MeasurementDatabase()
    db.insertResults(Array.from({ length: 10 }, () => makeResult()))
    const recent = db.queryRecent(3)
    expect(recent.length).toBeLessThanOrEqual(3)
    db.close()
  })

  test('insertBaseline and getLatestBaselines round-trip', () => {
    const db = new MeasurementDatabase()
    const entry = {
      language: 'en' as const,
      avgMs: 1.0,
      p95Ms: 2.0,
      p99Ms: 3.0,
      passRate: 1.0,
      recordedAt: Date.now(),
      version: '1.0.0',
    }
    db.insertBaseline(entry)
    const baselines = db.getLatestBaselines()
    expect(baselines.length).toBeGreaterThanOrEqual(1)
    const found = baselines.find((b) => b.language === 'en')
    expect(found).toBeDefined()
    expect(found!.avgMs).toBeCloseTo(1.0)
    db.close()
  })
})
