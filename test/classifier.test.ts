// Unit tests for the divergence classifier (Phase 2).
//
// Tests each detection strategy in isolation using fake MeasurementResults
// (no real browser or DOM access required).

import { describe, expect, test } from 'bun:test'
import { classifyDivergenceSync } from '../src/measurement-validator/classifier.js'
import type { MeasurementLinePair, MeasurementResult, MeasurementSample } from '../src/measurement-validator/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeSample(overrides: Partial<MeasurementSample> = {}): MeasurementSample {
  return {
    text: 'Hello world',
    font: '16px Arial',
    maxWidth: 400,
    lineHeight: 20,
    ...overrides,
  }
}

function fakeLinePair(delta: number): MeasurementLinePair {
  return {
    lineIndex: 0,
    pretextText: 'Hello world',
    pretextWidth: 80 + delta,
    domText: 'Hello world',
    domWidth: 80,
    delta,
    severity: Math.abs(delta) <= 0.5 ? 'pass' : Math.abs(delta) <= 1 ? 'minor' : Math.abs(delta) <= 2 ? 'major' : 'critical',
  }
}

function fakeResult(
  sample: MeasurementSample,
  delta: number,
  overallSeverity: MeasurementResult['overallSeverity'] = 'major',
): MeasurementResult {
  return {
    sample,
    pretextLineCount: 1,
    domLineCount: 1,
    lineCountMatch: true,
    lines: [fakeLinePair(delta)],
    overallSeverity,
    passRate: overallSeverity === 'pass' ? 1 : 0,
    maxDelta: Math.abs(delta),
    durationMs: 1,
  }
}

// ---------------------------------------------------------------------------
// Pass-through: no divergence
// ---------------------------------------------------------------------------

describe('classifyDivergenceSync — no divergence', () => {
  test('returns detected=false when result is pass', () => {
    const result = fakeResult(fakeSample(), 0, 'pass')
    const analysis = classifyDivergenceSync(result)
    expect(analysis.detected).toBe(false)
    expect(analysis.confidence).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Bidi detection
// ---------------------------------------------------------------------------

describe('classifyDivergenceSync — bidi detection', () => {
  test('detects RTL Arabic text', () => {
    const sample = fakeSample({ text: 'مرحباً بالعالم' })
    const result = fakeResult(sample, 5)
    const analysis = classifyDivergenceSync(result)

    expect(analysis.detected).toBe(true)
    expect(analysis.rootCause).toBe('bidi_shaping')
    expect(analysis.confidence).toBeGreaterThan(0.5)
    expect(analysis.recommendation).toContain('RTL')
  })

  test('detects RTL Hebrew text', () => {
    const sample = fakeSample({ text: 'שלום עולם' })
    const result = fakeResult(sample, 3)
    const analysis = classifyDivergenceSync(result)

    expect(analysis.detected).toBe(true)
    expect(analysis.rootCause).toBe('bidi_shaping')
  })

  test('does not flag LTR English as bidi', () => {
    const sample = fakeSample({ text: 'Hello world', font: '16px Arial' })
    const result = fakeResult(sample, 3) // delta high enough to trigger "something"
    const analysis = classifyDivergenceSync(result)

    expect(analysis.rootCause).not.toBe('bidi_shaping')
  })
})

// ---------------------------------------------------------------------------
// Emoji detection
// ---------------------------------------------------------------------------

describe('classifyDivergenceSync — emoji detection', () => {
  test('detects emoji in text', () => {
    const sample = fakeSample({ text: 'Hello 🌍 world' })
    const result = fakeResult(sample, 3)
    const analysis = classifyDivergenceSync(result)

    expect(analysis.detected).toBe(true)
    expect(analysis.rootCause).toBe('emoji_rendering')
    expect(analysis.recommendation).toContain('emoji')
  })

  test('detects emoji sequence', () => {
    const sample = fakeSample({ text: '👨‍👩‍👧‍👦 family' })
    const result = fakeResult(sample, 2)
    const analysis = classifyDivergenceSync(result)

    expect(analysis.detected).toBe(true)
    expect(analysis.rootCause).toBe('emoji_rendering')
  })

  test('does not flag plain ASCII as emoji', () => {
    const sample = fakeSample({ text: 'no emoji here' })
    const result = fakeResult(sample, 3)
    const analysis = classifyDivergenceSync(result)

    expect(analysis.rootCause).not.toBe('emoji_rendering')
  })
})

// ---------------------------------------------------------------------------
// Browser quirk detection
// ---------------------------------------------------------------------------

describe('classifyDivergenceSync — browser quirk detection', () => {
  test('detects system-ui font', () => {
    const sample = fakeSample({ font: '16px system-ui' })
    const result = fakeResult(sample, 3)
    const analysis = classifyDivergenceSync(result)

    expect(analysis.detected).toBe(true)
    expect(analysis.rootCause).toBe('browser_quirk')
    expect(analysis.details['quirkType']).toBe('os_rendering')
  })

  test('detects variable font', () => {
    const sample = fakeSample({ font: '16px Inter variation-settings' })
    const result = fakeResult(sample, 3)
    const analysis = classifyDivergenceSync(result)

    expect(analysis.detected).toBe(true)
    expect(analysis.rootCause).toBe('browser_quirk')
    expect(analysis.details['quirkType']).toBe('variable_font')
  })
})

// ---------------------------------------------------------------------------
// Unknown divergence fallback
// ---------------------------------------------------------------------------

describe('classifyDivergenceSync — unknown divergence', () => {
  test('returns unknown when no specific cause matches', () => {
    const sample = fakeSample({ text: 'simple text', font: '16px Arial' })
    const result = fakeResult(sample, 5)
    const analysis = classifyDivergenceSync(result)

    expect(analysis.detected).toBe(true)
    expect(analysis.rootCause).toBe('unknown')
    expect(analysis.confidence).toBeLessThan(0.5)
    expect(analysis.recommendation).toContain('Pretext')
  })
})

// ---------------------------------------------------------------------------
// Priority ordering
// ---------------------------------------------------------------------------

describe('classifyDivergenceSync — priority ordering', () => {
  test('bidi takes priority over emoji when both present', () => {
    // Arabic text with emoji — bidi should win (higher priority)
    const sample = fakeSample({ text: 'مرحبا 🌍' })
    const result = fakeResult(sample, 5)
    const analysis = classifyDivergenceSync(result)

    expect(analysis.rootCause).toBe('bidi_shaping')
  })

  test('emoji takes priority over unknown for plain text with emoji', () => {
    const sample = fakeSample({ text: 'Hello 😊 world' })
    const result = fakeResult(sample, 3)
    const analysis = classifyDivergenceSync(result)

    expect(analysis.rootCause).toBe('emoji_rendering')
  })
})

// ---------------------------------------------------------------------------
// DivergenceAnalysis shape
// ---------------------------------------------------------------------------

describe('classifyDivergenceSync — output shape', () => {
  test('always returns required fields', () => {
    const sample = fakeSample()
    const result = fakeResult(sample, 3)
    const analysis = classifyDivergenceSync(result)

    expect(typeof analysis.detected).toBe('boolean')
    expect(typeof analysis.severity).toBe('string')
    expect(typeof analysis.confidence).toBe('number')
    expect(typeof analysis.recommendation).toBe('string')
    expect(typeof analysis.details).toBe('object')
  })

  test('confidence is between 0 and 1', () => {
    const cases: Array<[string, number]> = [
      ['مرحبا', 5],
      ['Hello 😊', 3],
      ['simple text', 5],
    ]
    for (const [text, delta] of cases) {
      const result = fakeResult(fakeSample({ text }), delta)
      const analysis = classifyDivergenceSync(result)
      expect(analysis.confidence).toBeGreaterThanOrEqual(0)
      expect(analysis.confidence).toBeLessThanOrEqual(1)
    }
  })
})
