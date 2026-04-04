import { describe, expect, test, beforeAll } from 'bun:test'
import type { MeasurementResult, MeasurementSample } from '../src/measurement-validator/types.ts'
import { SEVERITY_THRESHOLDS } from '../src/measurement-validator/types.ts'
import { classifySeverity } from '../src/measurement-validator/comparator.ts'
import {
  generateJSONReport,
  generateConsoleSummary,
  generateDetailedReport,
  generateLanguageBreakdown,
} from '../src/measurement-validator/report-generator.ts'
import englishSamples from './fixtures/english-samples.json'

// Mock DOM environment for MeasurementComparator tests
beforeAll(() => {
  const mockContainer = {
    style: {} as Record<string, string>,
    offsetHeight: 40,
    offsetWidth: 400,
    textContent: '' as string | null,
  }

  Reflect.set(globalThis, 'document', {
    fonts: { ready: Promise.resolve() },
    createElement: (_tag: string) => ({ ...mockContainer, style: {} as Record<string, string> }),
    body: {
      appendChild: (_el: unknown) => undefined,
      removeChild: (_el: unknown) => undefined,
    },
  })

  Reflect.set(globalThis, 'window', {
    getComputedStyle: (_el: unknown) => ({
      lineHeight: '20px',
      fontSize: '16px',
    }),
  })
})

// ──────────────────────────────────────────────────────────────
// SEVERITY_THRESHOLDS
// ──────────────────────────────────────────────────────────────

describe('SEVERITY_THRESHOLDS', () => {
  test('has expected threshold values', () => {
    expect(SEVERITY_THRESHOLDS.exact).toBe(0.1)
    expect(SEVERITY_THRESHOLDS.minor).toBe(0.5)
    expect(SEVERITY_THRESHOLDS.major).toBe(2.0)
    expect(SEVERITY_THRESHOLDS.critical).toBe(Infinity)
  })
})

// ──────────────────────────────────────────────────────────────
// classifySeverity
// ──────────────────────────────────────────────────────────────

describe('classifySeverity', () => {
  test('returns exact for delta below exact threshold', () => {
    expect(classifySeverity(0)).toBe('exact')
    expect(classifySeverity(0.05)).toBe('exact')
    expect(classifySeverity(0.09)).toBe('exact')
  })

  test('returns minor for delta in minor range', () => {
    expect(classifySeverity(0.1)).toBe('minor')
    expect(classifySeverity(0.3)).toBe('minor')
    expect(classifySeverity(0.49)).toBe('minor')
  })

  test('returns major for delta in major range', () => {
    expect(classifySeverity(0.5)).toBe('major')
    expect(classifySeverity(1.0)).toBe('major')
    expect(classifySeverity(1.99)).toBe('major')
  })

  test('returns critical for delta at or above major threshold', () => {
    expect(classifySeverity(2.0)).toBe('critical')
    expect(classifySeverity(5.0)).toBe('critical')
    expect(classifySeverity(100)).toBe('critical')
  })
})

// ──────────────────────────────────────────────────────────────
// English fixtures
// ──────────────────────────────────────────────────────────────

describe('english-samples.json fixtures', () => {
  test('loads 10 English fixtures', () => {
    expect(englishSamples).toHaveLength(10)
  })

  test('every fixture has required fields', () => {
    for (const sample of englishSamples) {
      expect(typeof sample.id).toBe('string')
      expect(typeof sample.text).toBe('string')
      expect(typeof sample.font).toBe('string')
      expect(typeof sample.maxWidth).toBe('number')
    }
  })

  test('fixture IDs are unique', () => {
    const ids = englishSamples.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('maxWidth values are positive', () => {
    for (const sample of englishSamples) {
      expect(sample.maxWidth).toBeGreaterThan(0)
    }
  })
})

// ──────────────────────────────────────────────────────────────
// Report generators
// ──────────────────────────────────────────────────────────────

function makeMockResult(overallSeverity: MeasurementResult['overallSeverity'], lineCount = 2): MeasurementResult {
  const sample: MeasurementSample = {
    text: 'Hello world',
    font: '16px Arial',
    maxWidth: 400,
    lineHeight: 20,
  }
  return {
    sample,
    lines: Array.from({ length: lineCount }, (_, i) => ({
      index: i,
      text: `Line ${i}`,
      pretextWidth: 100,
      domWidth: 100,
      delta: 0,
      percentError: 0,
      severity: 'exact' as const,
    })),
    totalLines: lineCount,
    exactMatches: lineCount,
    minorDelta: 0,
    majorDelta: 0,
    criticalDelta: 0,
    overallSeverity,
    timestamp: '2024-01-01T00:00:00.000Z',
    executionTimeMs: 1.5,
  }
}

describe('generateJSONReport', () => {
  test('returns valid JSON', () => {
    const results = [makeMockResult('pass')]
    const json = generateJSONReport(results)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  test('serializes all result fields', () => {
    const results = [makeMockResult('pass')]
    const parsed = JSON.parse(generateJSONReport(results)) as MeasurementResult[]
    expect(parsed[0]?.overallSeverity).toBe('pass')
    expect(parsed[0]?.sample.text).toBe('Hello world')
  })

  test('handles empty results array', () => {
    expect(generateJSONReport([])).toBe('[]')
  })
})

describe('generateConsoleSummary', () => {
  test('includes pass/warning/error/critical counts', () => {
    const results = [
      makeMockResult('pass'),
      makeMockResult('warning'),
      makeMockResult('error'),
      makeMockResult('critical'),
    ]
    const summary = generateConsoleSummary(results)
    expect(summary).toContain('4')
    expect(summary).toContain('Pass Rate:')
  })

  test('calculates correct pass rate', () => {
    const results = [makeMockResult('pass'), makeMockResult('pass'), makeMockResult('error')]
    const summary = generateConsoleSummary(results)
    expect(summary).toContain('66.67%')
  })

  test('handles empty results', () => {
    const summary = generateConsoleSummary([])
    expect(summary).toContain('0')
    expect(summary).toContain('0.00%')
  })
})

describe('generateDetailedReport', () => {
  test('includes sample text and severity', () => {
    const results = [makeMockResult('pass')]
    const report = generateDetailedReport(results)
    expect(report).toContain('Hello world')
    expect(report).toContain('PASS')
  })

  test('includes line details', () => {
    const results = [makeMockResult('warning', 3)]
    const report = generateDetailedReport(results)
    expect(report).toContain('Line Details')
  })
})

describe('generateLanguageBreakdown', () => {
  test('counts results by severity', () => {
    const results = [makeMockResult('pass'), makeMockResult('pass'), makeMockResult('error')]
    const breakdown = generateLanguageBreakdown(results)
    expect(breakdown).toContain('pass: 2')
    expect(breakdown).toContain('error: 1')
  })

  test('handles empty results', () => {
    const breakdown = generateLanguageBreakdown([])
    expect(breakdown).toContain('pass: 0')
  })
})

// ──────────────────────────────────────────────────────────────
// MeasurementComparator basic integration
// ──────────────────────────────────────────────────────────────

describe('MeasurementComparator', () => {
  test('constructs without error', async () => {
    const { MeasurementComparator } = await import('../src/measurement-validator/comparator.ts')
    const comparator = new MeasurementComparator()
    expect(comparator).toBeDefined()
  })

  test('compare returns a MeasurementResult shape', async () => {
    const { MeasurementComparator } = await import('../src/measurement-validator/comparator.ts')
    const comparator = new MeasurementComparator()
    const sample: MeasurementSample = {
      text: 'Hello world',
      font: '16px Arial',
      maxWidth: 400,
      lineHeight: 20,
    }
    const pretextLayout = {
      lines: [
        { text: 'Hello world', width: 400 },
      ],
    }
    const result = await comparator.compare(sample, pretextLayout)
    expect(result).toBeDefined()
    expect(typeof result.totalLines).toBe('number')
    expect(typeof result.executionTimeMs).toBe('number')
    expect(['pass', 'warning', 'error', 'critical']).toContain(result.overallSeverity)
  })
})
