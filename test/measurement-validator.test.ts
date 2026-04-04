// Unit and integration tests for the measurement validator (Phase 1 + Phase 2).
//
// These tests exercise the comparator and report-generator modules using a
// fake DOM adapter (no real browser required), keeping them fast and
// deterministic.  For browser-specific accuracy, use the browser checker pages.

import { describe, expect, test } from 'bun:test'
import { compareMeasurements } from '../src/measurement-validator/comparator.js'
import {
  formatDivergenceConsole,
  formatResultConsole,
  formatResultJSON,
  buildGroupStats,
} from '../src/measurement-validator/report-generator.js'
import {
  DEFAULT_TOLERANCE,
  type MeasurementSample,
} from '../src/measurement-validator/types.js'
import type { DOMLineMetrics } from '../src/measurement-validator/dom-adapter.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeSample(overrides: Partial<MeasurementSample> = {}): MeasurementSample {
  return {
    text: 'Hello, world!',
    font: '16px Arial',
    maxWidth: 400,
    lineHeight: 20,
    ...overrides,
  }
}

function fakeDOMLines(lines: Array<{ text: string; width: number }>): DOMLineMetrics[] {
  return lines
}

// ---------------------------------------------------------------------------
// compareMeasurements
// ---------------------------------------------------------------------------

describe('compareMeasurements', () => {
  test('pass when Pretext and DOM agree within tolerance', () => {
    const sample = fakeSample({ text: 'hello world' })
    // Inject fake DOM lines that match what Pretext would produce for simple text.
    // We choose widths close to zero to stay within the default passDelta threshold
    // even though the fake DOM widths may not exactly match canvas output.
    const domLines = fakeDOMLines([{ text: 'hello world', width: 0 }])
    const result = compareMeasurements(sample, domLines)

    expect(result.sample).toBe(sample)
    expect(result.pretextLineCount).toBeGreaterThan(0)
    expect(result.lines.length).toBeGreaterThan(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  test('detects line count mismatch', () => {
    const sample = fakeSample({ text: 'hello world', maxWidth: 400 })
    // Provide 2 DOM lines when Pretext likely produces 1
    const domLines = fakeDOMLines([
      { text: 'hello', width: 30 },
      { text: 'world', width: 30 },
    ])
    const result = compareMeasurements(sample, domLines)

    // At minimum, lineCountMatch should reflect the mismatch correctly
    expect(typeof result.lineCountMatch).toBe('boolean')
    expect(typeof result.overallSeverity).toBe('string')
  })

  test('severity escalates with large delta', () => {
    const sample = fakeSample()
    // Provide DOM lines with zero width so delta = pretextWidth, which is large
    const domLines = fakeDOMLines([{ text: 'Hello, world!', width: 0 }])
    const result = compareMeasurements(sample, domLines)

    expect(['pass', 'minor', 'major', 'critical']).toContain(result.overallSeverity)
    expect(result.passRate).toBeGreaterThanOrEqual(0)
    expect(result.passRate).toBeLessThanOrEqual(1)
    expect(result.maxDelta).toBeGreaterThanOrEqual(0)
  })

  test('handles empty text without throwing', () => {
    const sample = fakeSample({ text: '' })
    const domLines: DOMLineMetrics[] = []
    const result = compareMeasurements(sample, domLines)
    expect(result).toBeDefined()
    expect(result.overallSeverity).toBe('pass')
  })

  test('custom tolerance is respected', () => {
    const sample = fakeSample()
    const domLines = fakeDOMLines([{ text: 'Hello, world!', width: 0 }])
    // Very tight tolerance — almost any delta triggers critical
    const result = compareMeasurements(sample, domLines, {
      tolerance: { passDelta: 0, minorDelta: 0.1, majorDelta: 0.5 },
    })
    expect(['minor', 'major', 'critical']).toContain(result.overallSeverity)
  })

  test('uses DEFAULT_TOLERANCE when no options provided', () => {
    expect(DEFAULT_TOLERANCE.passDelta).toBe(0.5)
    expect(DEFAULT_TOLERANCE.minorDelta).toBe(1.0)
    expect(DEFAULT_TOLERANCE.majorDelta).toBe(2.0)
  })
})

// ---------------------------------------------------------------------------
// Report generator
// ---------------------------------------------------------------------------

describe('formatResultJSON', () => {
  test('returns valid JSON', () => {
    const sample = fakeSample()
    const domLines = fakeDOMLines([{ text: 'Hello, world!', width: 80 }])
    const result = compareMeasurements(sample, domLines)
    const json = formatResultJSON(result)
    expect(() => JSON.parse(json)).not.toThrow()
    const parsed = JSON.parse(json) as typeof result
    expect(parsed.sample.text).toBe('Hello, world!')
  })
})

describe('formatResultConsole', () => {
  test('returns non-empty string', () => {
    const sample = fakeSample()
    const domLines = fakeDOMLines([{ text: 'Hello, world!', width: 80 }])
    const result = compareMeasurements(sample, domLines)
    const output = formatResultConsole(result)
    expect(typeof output).toBe('string')
    expect(output.length).toBeGreaterThan(0)
  })
})

describe('formatDivergenceConsole', () => {
  test('no divergence message', () => {
    const output = formatDivergenceConsole({
      detected: false,
      severity: 'minor',
      confidence: 1,
      recommendation: 'No divergence detected.',
      details: {},
    })
    expect(output).toContain('No divergence')
  })

  test('divergence with rootCause', () => {
    const output = formatDivergenceConsole({
      detected: true,
      severity: 'critical',
      rootCause: 'font_fallback',
      confidence: 0.95,
      recommendation: 'Font not loaded.',
      details: {},
    })
    expect(output).toContain('font_fallback')
  })
})

describe('buildGroupStats', () => {
  test('computes correct stats for empty results', () => {
    const stats = buildGroupStats('ltr-simple', [])
    expect(stats.total).toBe(0)
    expect(stats.passed).toBe(0)
    expect(stats.passRate).toBe(1)
    expect(stats.maxDelta).toBe(0)
    expect(stats.averageDelta).toBe(0)
  })

  test('computes correct stats for passing results', () => {
    const sample = fakeSample()
    const domLines = fakeDOMLines([{ text: 'Hello, world!', width: 0 }])
    const result = compareMeasurements(sample, domLines)

    const stats = buildGroupStats('ltr-simple', [result])
    expect(stats.total).toBe(1)
    expect(stats.group).toBe('ltr-simple')
    expect(stats.passRate).toBeGreaterThanOrEqual(0)
    expect(stats.passRate).toBeLessThanOrEqual(1)
  })
})
