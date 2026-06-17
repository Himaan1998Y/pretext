import { describe, expect, test, beforeAll } from 'bun:test'
import { detectBidi, detectEmoji, detectBrowserQuirk } from '../src/measurement-validator/classifier.ts'
import { classifyDivergence } from '../src/measurement-validator/classifier.ts'
import type { MeasurementResult, MeasurementSample } from '../src/measurement-validator/types.ts'
import rtlSamples from './fixtures/rtl-samples.json'
import cjkSamples from './fixtures/cjk-samples.json'
import complexSamples from './fixtures/complex-script-samples.json'
import mixedBidiSamples from './fixtures/mixed-bidi-samples.json'

// Mock DOM for detectFontFallback (called inside classifyDivergence)
beforeAll(() => {
  const makeContainer = () => ({
    style: {} as Record<string, string>,
    offsetHeight: 40,
    offsetWidth: 400,
    textContent: '' as string | null,
  })

  Reflect.set(globalThis, 'document', {
    fonts: { ready: Promise.resolve() },
    createElement: (_tag: string) => makeContainer(),
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
// detectBidi
// ──────────────────────────────────────────────────────────────

describe('detectBidi', () => {
  test('returns not detected for Latin text', () => {
    const sample: MeasurementSample = { text: 'Hello world', font: '16px Arial', maxWidth: 400 }
    const result = detectBidi(sample)
    expect(result.detected).toBe(false)
  })

  test('detects Arabic text as RTL', () => {
    const sample: MeasurementSample = { text: 'مرحبا بالعالم', font: '16px Arial', maxWidth: 400 }
    const result = detectBidi(sample)
    expect(result.detected).toBe(true)
    expect(result.severity).toBe('major')
  })

  test('detects Hebrew text as RTL', () => {
    const sample: MeasurementSample = { text: 'שלום עולם', font: '16px Arial', maxWidth: 400 }
    const result = detectBidi(sample)
    expect(result.detected).toBe(true)
  })

  test('detects mixed bidi text', () => {
    const sample: MeasurementSample = { text: 'Hello مرحبا world', font: '16px Arial', maxWidth: 400 }
    const result = detectBidi(sample)
    expect(result.detected).toBe(true)
  })

  test('does not flag CJK text as RTL', () => {
    const sample: MeasurementSample = { text: '你好世界', font: '16px Arial', maxWidth: 400 }
    const result = detectBidi(sample)
    expect(result.detected).toBe(false)
  })

  test('rtl-samples all trigger bidi detection (except ar-mixed which has mixed content)', () => {
    const rtlOnly = rtlSamples.filter((s) => !s.id.includes('mixed'))
    for (const sample of rtlOnly) {
      const result = detectBidi({ text: sample.text, font: sample.font, maxWidth: sample.maxWidth })
      expect(result.detected).toBe(true)
    }
  })
})

// ──────────────────────────────────────────────────────────────
// detectEmoji
// ──────────────────────────────────────────────────────────────

describe('detectEmoji', () => {
  test('returns not detected for plain text', () => {
    const sample: MeasurementSample = { text: 'Hello world', font: '16px Arial', maxWidth: 400 }
    const result = detectEmoji(sample)
    expect(result.detected).toBe(false)
    expect(result.emojiCount).toBe(0)
  })

  test('detects emoji in text', () => {
    const sample: MeasurementSample = { text: 'Hello 😀 world', font: '16px Arial', maxWidth: 400 }
    const result = detectEmoji(sample)
    expect(result.detected).toBe(true)
    expect(result.emojiCount).toBeGreaterThan(0)
  })

  test('counts multiple emoji', () => {
    const sample: MeasurementSample = { text: '😀🎉🌟', font: '16px Arial', maxWidth: 400 }
    const result = detectEmoji(sample)
    expect(result.detected).toBe(true)
    expect(result.emojiCount).toBeGreaterThanOrEqual(3)
  })

  test('does not flag Arabic chars as emoji', () => {
    const sample: MeasurementSample = { text: 'مرحبا', font: '16px Arial', maxWidth: 400 }
    const result = detectEmoji(sample)
    expect(result.detected).toBe(false)
  })

  test('cjk-samples do not trigger emoji detection', () => {
    for (const sample of cjkSamples) {
      const result = detectEmoji({ text: sample.text, font: sample.font, maxWidth: sample.maxWidth })
      expect(result.detected).toBe(false)
    }
  })
})

// ──────────────────────────────────────────────────────────────
// detectBrowserQuirk
// ──────────────────────────────────────────────────────────────

describe('detectBrowserQuirk', () => {
  test('returns not detected when navigator is undefined', () => {
    const sample: MeasurementSample = { text: 'Hello', font: '16px Arial', maxWidth: 400 }
    // navigator is not defined in bun test env; the function falls back to ''
    const result = detectBrowserQuirk(sample)
    expect(result.detected).toBe(false)
  })

  test('detects Safari quirk when UA contains Safari but not Chrome', () => {
    Reflect.set(globalThis, 'navigator', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    })
    const sample: MeasurementSample = { text: 'Hello', font: '16px Arial', maxWidth: 400 }
    const result = detectBrowserQuirk(sample)
    expect(result.detected).toBe(true)
    expect(result.severity).toBe('major')

    // Cleanup
    Reflect.deleteProperty(globalThis, 'navigator')
  })

  test('does not flag Chrome as a quirk', () => {
    Reflect.set(globalThis, 'navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    const sample: MeasurementSample = { text: 'Hello', font: '16px Arial', maxWidth: 400 }
    const result = detectBrowserQuirk(sample)
    expect(result.detected).toBe(false)

    // Cleanup
    Reflect.deleteProperty(globalThis, 'navigator')
  })
})

// ──────────────────────────────────────────────────────────────
// classifyDivergence — pass case (no DOM calls needed)
// ──────────────────────────────────────────────────────────────

describe('classifyDivergence', () => {
  test('returns not-detected for passing result', async () => {
    const sample: MeasurementSample = { text: 'Hello world', font: '16px Arial', maxWidth: 400 }
    const result: MeasurementResult = {
      sample,
      lines: [],
      totalLines: 1,
      exactMatches: 1,
      minorDelta: 0,
      majorDelta: 0,
      criticalDelta: 0,
      overallSeverity: 'pass',
      timestamp: '2024-01-01T00:00:00.000Z',
      executionTimeMs: 1.0,
    }
    const analysis = await classifyDivergence(result, sample)
    expect(analysis.detected).toBe(false)
    expect(analysis.confidence).toBe(1.0)
    expect(analysis.recommendation).toBe('No divergence detected')
  })

  test('detects bidi_shaping or font_fallback for Arabic text', async () => {
    // In a mocked DOM environment where all fonts return identical measurements,
    // detectFontFallback fires first (similar widths ≈ font may not be loaded).
    // Outside mocked environments, bidi_shaping would be the expected root cause.
    const sample: MeasurementSample = { text: 'مرحبا بالعالم', font: '16px Arial', maxWidth: 400 }
    const result: MeasurementResult = {
      sample,
      lines: [{ index: 0, text: 'مرحبا بالعالم', pretextWidth: 100, domWidth: 200, delta: 100, percentError: 50, severity: 'critical' }],
      totalLines: 1,
      exactMatches: 0,
      minorDelta: 0,
      majorDelta: 0,
      criticalDelta: 1,
      overallSeverity: 'critical',
      timestamp: '2024-01-01T00:00:00.000Z',
      executionTimeMs: 2.0,
    }
    const analysis = await classifyDivergence(result, sample)
    expect(analysis.detected).toBe(true)
    expect(['bidi_shaping', 'font_fallback']).toContain(analysis.rootCause)
  })

  test('detects emoji_rendering or font_fallback for emoji text', async () => {
    // In a mocked DOM environment, detectFontFallback may fire first.
    // Outside mocked environments, emoji_rendering would be the expected root cause.
    const sample: MeasurementSample = { text: '😀🎉🌟', font: '16px Arial', maxWidth: 400 }
    const result: MeasurementResult = {
      sample,
      lines: [{ index: 0, text: '😀🎉🌟', pretextWidth: 30, domWidth: 60, delta: 30, percentError: 50, severity: 'critical' }],
      totalLines: 1,
      exactMatches: 0,
      minorDelta: 0,
      majorDelta: 0,
      criticalDelta: 1,
      overallSeverity: 'critical',
      timestamp: '2024-01-01T00:00:00.000Z',
      executionTimeMs: 2.0,
    }
    const analysis = await classifyDivergence(result, sample)
    expect(analysis.detected).toBe(true)
    expect(['emoji_rendering', 'font_fallback']).toContain(analysis.rootCause)
  })
})

// ──────────────────────────────────────────────────────────────
// Fixture coverage checks
// ──────────────────────────────────────────────────────────────

describe('rtl-samples fixtures', () => {
  test('loads 5 RTL fixtures', () => {
    expect(rtlSamples).toHaveLength(5)
  })

  test('every fixture has required fields', () => {
    for (const sample of rtlSamples) {
      expect(typeof sample.id).toBe('string')
      expect(typeof sample.text).toBe('string')
      expect(typeof sample.maxWidth).toBe('number')
    }
  })
})

describe('cjk-samples fixtures', () => {
  test('loads 5 CJK fixtures', () => {
    expect(cjkSamples).toHaveLength(5)
  })
})

describe('complex-script-samples fixtures', () => {
  test('loads 5 complex script fixtures', () => {
    expect(complexSamples).toHaveLength(5)
  })
})

describe('mixed-bidi-samples fixtures', () => {
  test('loads 4 mixed bidi fixtures', () => {
    expect(mixedBidiSamples).toHaveLength(4)
  })
})
