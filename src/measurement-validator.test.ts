import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

// Tests for the MeasurementValidator module.
// These run in a Node/Bun environment (no live DOM), so the comparator is
// always configured with pretextOnly: true to avoid DOM reads.

// Minimal OffscreenCanvas stub (matches the one in layout.test.ts).
class TestOffscreenCanvas {
  width: number
  height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  getContext(_type: string): CanvasRenderingContext2D {
    return {
      measureText(text: string) {
        const fontSize = 16
        let width = 0
        for (const ch of text) {
          if (ch === ' ') {
            width += fontSize * 0.33
          } else if (ch === '\t') {
            width += fontSize * 1.32
          } else if (/\p{Emoji_Presentation}/u.test(ch) || ch === '\uFE0F') {
            width += fontSize
          } else if (isWideChar(ch)) {
            width += fontSize
          } else if (/[.,!?;:%)\]}'""'»›…—-]/u.test(ch)) {
            width += fontSize * 0.4
          } else {
            width += fontSize * 0.6
          }
        }
        return { width }
      },
    } as unknown as CanvasRenderingContext2D
  }
}

function isWideChar(ch: string): boolean {
  const code = ch.codePointAt(0)!
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xff00 && code <= 0xffef)
  )
}

type ValidatorModule = typeof import('./measurement-validator.ts')

let MeasurementComparator: ValidatorModule['MeasurementComparator']
let DivergenceClassifier: ValidatorModule['DivergenceClassifier']
let ReportGenerator: ValidatorModule['ReportGenerator']
let TestSuiteRunner: ValidatorModule['TestSuiteRunner']
let classifyDelta: ValidatorModule['classifyDelta']
let deriveResultSeverity: ValidatorModule['deriveResultSeverity']
let clearCache: ValidatorModule['clearCache']
let setLocale: ValidatorModule['setLocale']

const FONT = '16px Test Sans'
const LINE_HEIGHT = 19

beforeAll(async () => {
  Reflect.set(globalThis, 'OffscreenCanvas', TestOffscreenCanvas)
  const mod = await import('./measurement-validator.ts')
  ;({ MeasurementComparator, DivergenceClassifier, ReportGenerator, TestSuiteRunner, classifyDelta, deriveResultSeverity, clearCache, setLocale } = mod)
})

beforeEach(() => {
  setLocale(undefined)
  clearCache()
})

// ---------------------------------------------------------------------------
// classifyDelta
// ---------------------------------------------------------------------------

describe('classifyDelta', () => {
  test('zero delta is exact', () => {
    expect(classifyDelta(0)).toBe('exact')
  })

  test('small delta under 0.5px is minor', () => {
    expect(classifyDelta(0.3)).toBe('minor')
    expect(classifyDelta(-0.4)).toBe('minor')
  })

  test('delta between 0.5px and 2px is major', () => {
    expect(classifyDelta(1)).toBe('major')
    expect(classifyDelta(-1.5)).toBe('major')
  })

  test('delta at or above 2px is critical', () => {
    expect(classifyDelta(2)).toBe('critical')
    expect(classifyDelta(15)).toBe('critical')
    expect(classifyDelta(-3)).toBe('critical')
  })
})

// ---------------------------------------------------------------------------
// deriveResultSeverity
// ---------------------------------------------------------------------------

describe('deriveResultSeverity', () => {
  test('no lines → pass', () => {
    expect(deriveResultSeverity([], false)).toBe('pass')
  })

  test('line mismatch overrides everything → critical', () => {
    expect(deriveResultSeverity([], true)).toBe('critical')
  })

  test('exact lines → pass', () => {
    const lines = [{ index: 0, pretextWidth: 100, domWidth: 100, delta: 0, text: 'x', severity: 'exact' as const }]
    expect(deriveResultSeverity(lines, false)).toBe('pass')
  })

  test('minor delta → pass', () => {
    const lines = [{ index: 0, pretextWidth: 100, domWidth: 100.3, delta: 0.3, text: 'x', severity: 'minor' as const }]
    expect(deriveResultSeverity(lines, false)).toBe('pass')
  })

  test('major delta → warning', () => {
    const lines = [{ index: 0, pretextWidth: 100, domWidth: 101, delta: 1, text: 'x', severity: 'major' as const }]
    expect(deriveResultSeverity(lines, false)).toBe('warning')
  })

  test('critical delta → critical', () => {
    const lines = [{ index: 0, pretextWidth: 100, domWidth: 103, delta: 3, text: 'x', severity: 'critical' as const }]
    expect(deriveResultSeverity(lines, false)).toBe('critical')
  })
})

// ---------------------------------------------------------------------------
// DivergenceClassifier
// ---------------------------------------------------------------------------

describe('DivergenceClassifier', () => {
  test('detects bidi from RTL characters', () => {
    const classifier = new DivergenceClassifier()
    const causes = classifier.classify({ text: 'مرحبا', font: FONT }, [])
    expect(causes).toContain('bidi')
  })

  test('detects emoji', () => {
    const classifier = new DivergenceClassifier()
    const causes = classifier.classify({ text: 'Hello 😊', font: FONT }, [])
    expect(causes).toContain('emoji')
  })

  test('detects pre-wrap mode', () => {
    const classifier = new DivergenceClassifier()
    const causes = classifier.classify({ text: 'hello', font: FONT, whiteSpace: 'pre-wrap' }, [])
    expect(causes).toContain('pre-wrap')
  })

  test('returns empty causes for plain LTR text with no divergence', () => {
    const classifier = new DivergenceClassifier()
    const causes = classifier.classify({ text: 'hello world', font: FONT }, [])
    expect(causes).toHaveLength(0)
  })

  test('marks font-fallback when major divergence but no specific cause', () => {
    const classifier = new DivergenceClassifier()
    const lines = [
      { index: 0, pretextWidth: 100, domWidth: 103, delta: 3, text: 'hello', severity: 'critical' as const },
    ]
    const causes = classifier.classify({ text: 'hello', font: FONT }, lines)
    expect(causes).toContain('font-fallback')
  })
})

// ---------------------------------------------------------------------------
// MeasurementComparator (pretextOnly mode — no DOM)
// ---------------------------------------------------------------------------

describe('MeasurementComparator (pretextOnly)', () => {
  test('single-line short text produces zero height delta', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const result = comparator.compare({ text: 'Hello world', font: FONT, maxWidth: 400, lineHeight: LINE_HEIGHT })
    expect(result.heightDelta).toBe(0)
    expect(result.lineMismatch).toBe(false)
    expect(result.severity).toBe('pass')
  })

  test('line counts match in pretextOnly mode', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const result = comparator.compare({ text: 'Hello world', font: FONT, maxWidth: 400, lineHeight: LINE_HEIGHT })
    expect(result.pretextLineCount).toBe(result.domLineCount)
  })

  test('result carries input sample back', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const sample = { text: 'test', font: FONT, maxWidth: 200, lineHeight: LINE_HEIGHT }
    const result = comparator.compare(sample)
    expect(result.sample).toBe(sample)
  })

  test('empty text produces zero lines and height', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const result = comparator.compare({ text: '', font: FONT, maxWidth: 300, lineHeight: LINE_HEIGHT })
    expect(result.pretextLineCount).toBe(0)
    expect(result.pretextHeight).toBe(0)
  })

  test('compareAll returns one result per sample', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const samples = [
      { text: 'foo', font: FONT, maxWidth: 200, lineHeight: LINE_HEIGHT },
      { text: 'bar baz', font: FONT, maxWidth: 50, lineHeight: LINE_HEIGHT },
    ]
    const results = comparator.compareAll(samples)
    expect(results).toHaveLength(2)
  })

  test('result has valid ISO timestamp', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const result = comparator.compare({ text: 'Hello', font: FONT })
    expect(() => new Date(result.timestamp)).not.toThrow()
    expect(Number.isFinite(new Date(result.timestamp).getTime())).toBe(true)
  })

  test('narrow width forces multi-line layout', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const result = comparator.compare({ text: 'Hello world foo bar', font: FONT, maxWidth: 60, lineHeight: LINE_HEIGHT })
    expect(result.pretextLineCount).toBeGreaterThan(1)
  })

  test('per-line entries match line count', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const result = comparator.compare({ text: 'Hello world', font: FONT, maxWidth: 400, lineHeight: LINE_HEIGHT })
    expect(result.lines).toHaveLength(result.pretextLineCount)
  })

  test('all per-line deltas are zero in pretextOnly mode', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const result = comparator.compare({ text: 'Hello world', font: FONT, maxWidth: 300, lineHeight: LINE_HEIGHT })
    for (const line of result.lines) {
      expect(line.delta).toBe(0)
      expect(line.severity).toBe('exact')
    }
  })

  test('arabic text gets bidi cause even with zero divergence', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const result = comparator.compare({ text: 'مرحبا بالعالم', font: FONT, maxWidth: 300, lineHeight: LINE_HEIGHT })
    expect(result.causes).toContain('bidi')
  })

  test('pre-wrap mode produces a result', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const result = comparator.compare({
      text: 'line one\nline two',
      font: FONT,
      maxWidth: 300,
      lineHeight: LINE_HEIGHT,
      whiteSpace: 'pre-wrap',
    })
    expect(result.pretextLineCount).toBeGreaterThanOrEqual(2)
    expect(result.causes).toContain('pre-wrap')
  })
})

// ---------------------------------------------------------------------------
// TestSuiteRunner
// ---------------------------------------------------------------------------

describe('TestSuiteRunner', () => {
  test('empty corpus produces a zero-sample report', () => {
    const runner = new TestSuiteRunner({
      comparator: new MeasurementComparator({ pretextOnly: true }),
    })
    const report = runner.run([])
    expect(report.total).toBe(0)
    expect(report.passed).toBe(0)
    expect(report.passRate).toBe(1)
  })

  test('all-passing corpus produces 100% pass rate', () => {
    const runner = new TestSuiteRunner({
      comparator: new MeasurementComparator({ pretextOnly: true }),
    })
    const report = runner.run([
      { text: 'Hello', font: FONT, maxWidth: 300, lineHeight: LINE_HEIGHT },
      { text: 'World', font: FONT, maxWidth: 300, lineHeight: LINE_HEIGHT },
    ])
    expect(report.passed).toBe(2)
    expect(report.passRate).toBe(1)
    expect(report.errors).toBe(0)
    expect(report.criticals).toBe(0)
  })

  test('runOrThrow does not throw on all-passing corpus', () => {
    const runner = new TestSuiteRunner({
      comparator: new MeasurementComparator({ pretextOnly: true }),
      failOn: 'error',
    })
    expect(() =>
      runner.runOrThrow([{ text: 'test', font: FONT, maxWidth: 300, lineHeight: LINE_HEIGHT }]),
    ).not.toThrow()
  })

  test('report includes one result per sample', () => {
    const runner = new TestSuiteRunner({
      comparator: new MeasurementComparator({ pretextOnly: true }),
    })
    const samples = [
      { text: 'foo', font: FONT, maxWidth: 200, lineHeight: LINE_HEIGHT },
      { text: 'bar', font: FONT, maxWidth: 200, lineHeight: LINE_HEIGHT },
      { text: 'baz', font: FONT, maxWidth: 200, lineHeight: LINE_HEIGHT },
    ]
    const report = runner.run(samples)
    expect(report.results).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// ReportGenerator
// ---------------------------------------------------------------------------

describe('ReportGenerator', () => {
  function makeReport() {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const runner = new TestSuiteRunner({ comparator })
    return runner.run([
      { text: 'Hello world', font: FONT, maxWidth: 300, lineHeight: LINE_HEIGHT },
      { text: 'مرحبا', font: FONT, maxWidth: 300, lineHeight: LINE_HEIGHT },
    ])
  }

  test('text format contains pass count', () => {
    const gen = new ReportGenerator()
    const report = makeReport()
    const text = gen.render(report, 'text')
    expect(text).toContain('passed')
    expect(typeof text).toBe('string')
  })

  test('json format produces valid JSON', () => {
    const gen = new ReportGenerator()
    const report = makeReport()
    const json = gen.render(report, 'json')
    expect(() => JSON.parse(json)).not.toThrow()
    const parsed = JSON.parse(json) as { total: number }
    expect(parsed.total).toBe(2)
  })

  test('html format contains expected HTML structure', () => {
    const gen = new ReportGenerator()
    const report = makeReport()
    const html = gen.render(report, 'html')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<table>')
    expect(html).toContain('Measurement Validator')
  })

  test('renderResult produces valid text for a single result', () => {
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const result = comparator.compare({ text: 'Hello', font: FONT, maxWidth: 200, lineHeight: LINE_HEIGHT })
    const gen = new ReportGenerator({ includePassing: true })
    const text = gen.renderResult(result, 'text')
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(0)
  })

  test('includePassing includes pass rows in html', () => {
    const gen = new ReportGenerator({ includePassing: true })
    const report = makeReport()
    const html = gen.render(report, 'html')
    expect(html).toContain('severity-pass')
  })

  test('default (no includePassing) excludes pass rows from text', () => {
    const gen = new ReportGenerator()
    const comparator = new MeasurementComparator({ pretextOnly: true })
    const runner = new TestSuiteRunner({ comparator })
    const report = runner.run([{ text: 'Hello', font: FONT, maxWidth: 300, lineHeight: LINE_HEIGHT }])
    const text = gen.render(report, 'text')
    // Only the header line should be present since the sample passes
    expect(text).not.toContain('[PASS]')
  })
})
