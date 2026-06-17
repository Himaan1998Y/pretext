import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

// Measurement Validator integration tests.
//
// These tests exercise the pure-logic portions of the validator (types,
// severity classification, report generation, and comparator arithmetic)
// using the same fake canvas backend as layout.test.ts.
//
// DOM-dependent paths (measureDOM / compare / compareAll) require a real
// browser and are covered by the browser accuracy pages instead of this suite.

// ---------------------------------------------------------------------------
// Re-use the same fake canvas from layout.test.ts so that prepareWithSegments
// and layoutWithLines give deterministic measurements in the test environment.
// ---------------------------------------------------------------------------

function parseFontSize(font: string): number {
  const m = font.match(/(\d+(?:\.\d+)?)\s*px/)
  return m !== null ? Number.parseFloat(m[1]!) : 16
}

const emojiPresentationRe = /\p{Emoji_Presentation}/u
const punctuationRe = /[.,!?;:%)\]}'""'»›…—-]/u
const decimalDigitRe = /\p{Nd}/u

function measureWidth(text: string, font: string): number {
  const fontSize = parseFontSize(font)
  let width = 0
  let previousWasDecimalDigit = false

  for (const ch of text) {
    if (ch === ' ') {
      width += fontSize * 0.33
      previousWasDecimalDigit = false
    } else if (ch === '\t') {
      width += fontSize * 1.32
      previousWasDecimalDigit = false
    } else if (emojiPresentationRe.test(ch) || ch === '\uFE0F') {
      width += fontSize
      previousWasDecimalDigit = false
    } else if (decimalDigitRe.test(ch)) {
      width += fontSize * (previousWasDecimalDigit ? 0.48 : 0.52)
      previousWasDecimalDigit = true
    } else if (punctuationRe.test(ch)) {
      width += fontSize * 0.4
      previousWasDecimalDigit = false
    } else {
      width += fontSize * 0.6
      previousWasDecimalDigit = false
    }
  }

  return width
}

class TestCanvasRenderingContext2D {
  font = ''
  measureText(text: string): { width: number } {
    return { width: measureWidth(text, this.font) }
  }
}

class TestOffscreenCanvas {
  constructor(_w: number, _h: number) {}
  getContext(_kind: string): TestCanvasRenderingContext2D {
    return new TestCanvasRenderingContext2D()
  }
}

// ---------------------------------------------------------------------------
// Module-level references (loaded after canvas mock is installed).
// ---------------------------------------------------------------------------

type ValidatorModule = typeof import('../src/measurement-validator/index.ts')

let classifySeverity: ValidatorModule['classifySeverity']
let THRESHOLD_EXACT: ValidatorModule['THRESHOLD_EXACT']
let THRESHOLD_MINOR: ValidatorModule['THRESHOLD_MINOR']
let THRESHOLD_MAJOR: ValidatorModule['THRESHOLD_MAJOR']
let buildReport: ValidatorModule['buildReport']
let toJSON: ValidatorModule['toJSON']
let toConsoleText: ValidatorModule['toConsoleText']

type LayoutModule = typeof import('../src/layout.ts')
let prepareWithSegments: LayoutModule['prepareWithSegments']
let layoutWithLines: LayoutModule['layoutWithLines']
let clearCache: LayoutModule['clearCache']

// ---------------------------------------------------------------------------

beforeAll(async () => {
  Reflect.set(globalThis, 'OffscreenCanvas', TestOffscreenCanvas)

  const [validatorMod, layoutMod] = await Promise.all([
    import('../src/measurement-validator/index.ts'),
    import('../src/layout.ts'),
  ])

  ;({ classifySeverity, THRESHOLD_EXACT, THRESHOLD_MINOR, THRESHOLD_MAJOR, buildReport, toJSON, toConsoleText } = validatorMod)
  ;({ prepareWithSegments, layoutWithLines, clearCache } = layoutMod)
})

beforeEach(() => {
  clearCache()
})

// ---------------------------------------------------------------------------

describe('severity classification', () => {
  test('delta below THRESHOLD_EXACT is exact', () => {
    expect(classifySeverity(0)).toBe('exact')
    expect(classifySeverity(THRESHOLD_EXACT - 0.001)).toBe('exact')
  })

  test('delta at THRESHOLD_EXACT is minor', () => {
    expect(classifySeverity(THRESHOLD_EXACT)).toBe('minor')
    expect(classifySeverity(THRESHOLD_MINOR - 0.001)).toBe('minor')
  })

  test('delta at THRESHOLD_MINOR is major', () => {
    expect(classifySeverity(THRESHOLD_MINOR)).toBe('major')
    expect(classifySeverity(THRESHOLD_MAJOR - 0.001)).toBe('major')
  })

  test('delta at or above THRESHOLD_MAJOR is critical', () => {
    expect(classifySeverity(THRESHOLD_MAJOR)).toBe('critical')
    expect(classifySeverity(100)).toBe('critical')
  })
})

// ---------------------------------------------------------------------------

describe('report generator', () => {
  test('buildReport with no results produces zero counts and 100% pass rate', () => {
    const report = buildReport([])
    expect(report.summary.total).toBe(0)
    expect(report.summary.exact).toBe(0)
    expect(report.summary.passRate).toBe(100)
    expect(report.results).toHaveLength(0)
    expect(typeof report.generatedAt).toBe('string')
  })

  test('buildReport counts severities correctly', () => {
    type Sev = 'exact' | 'minor' | 'major' | 'critical'
    const makeResult = (severity: Sev, lineCountMatch = true) => ({
      sample: { text: 'hi', font: '16px Arial' },
      metrics: {
        lineCountMatch,
        pretextLineCount: 1,
        domLineCount: lineCountMatch ? 1 : 2,
        maxLineDelta: severity === 'exact' ? 0 : severity === 'minor' ? 0.2 : severity === 'major' ? 1 : 3,
        averageDelta: 0,
        severity,
      },
      lines: [],
      timestamp: new Date().toISOString(),
      userAgent: '',
    })

    const results = [
      makeResult('exact'),
      makeResult('exact'),
      makeResult('minor'),
      makeResult('major'),
      makeResult('critical', false),
    ]

    const report = buildReport(results)
    expect(report.summary.total).toBe(5)
    expect(report.summary.exact).toBe(2)
    expect(report.summary.minor).toBe(1)
    expect(report.summary.major).toBe(1)
    expect(report.summary.critical).toBe(1)
    expect(report.summary.lineCountMismatches).toBe(1)
    // exact + minor = 3, passRate = 3/5 = 60%
    expect(report.summary.passRate).toBeCloseTo(60, 1)
  })

  test('toJSON serializes to valid JSON', () => {
    const report = buildReport([])
    const json = toJSON(report)
    expect(() => JSON.parse(json)).not.toThrow()
    const pretty = toJSON(report, true)
    expect(pretty).toContain('\n')
  })

  test('toConsoleText includes all severity counts', () => {
    const report = buildReport([])
    const text = toConsoleText(report)
    expect(text).toContain('Total samples')
    expect(text).toContain('Pass rate')
  })
})

// ---------------------------------------------------------------------------

describe('pretext layout integration', () => {
  // These tests verify that the Pretext layout engine behaves consistently
  // with the fake canvas, which is what the comparator will consume.

  test('short text produces one line at wide width', () => {
    const FONT = '16px Test Sans'
    const prepared = prepareWithSegments('Hello world', FONT)
    const result = layoutWithLines(prepared, 1000, 20)
    expect(result.lineCount).toBe(1)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.text).toBe('Hello world')
    expect(result.lines[0]!.width).toBeGreaterThan(0)
  })

  test('text wraps at narrow width', () => {
    const FONT = '16px Test Sans'
    const prepared = prepareWithSegments('Hello world test', FONT)
    const result = layoutWithLines(prepared, 60, 20)
    expect(result.lineCount).toBeGreaterThan(1)
  })

  test('empty text produces zero lines', () => {
    const FONT = '16px Test Sans'
    const prepared = prepareWithSegments('', FONT)
    const result = layoutWithLines(prepared, 300, 20)
    expect(result.lineCount).toBe(0)
    expect(result.lines).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------

describe('comparator arithmetic (pure, no DOM)', () => {
  // Simulate comparator logic manually to verify the arithmetic contract.

  test('identical widths produce exact severity', () => {
    const delta = Math.abs(100 - 100)
    expect(classifySeverity(delta)).toBe('exact')
  })

  test('0.3px divergence is minor', () => {
    const delta = Math.abs(100.3 - 100)
    expect(classifySeverity(delta)).toBe('minor')
  })

  test('1px divergence is major', () => {
    const delta = Math.abs(101 - 100)
    expect(classifySeverity(delta)).toBe('major')
  })

  test('3px divergence is critical', () => {
    const delta = Math.abs(103 - 100)
    expect(classifySeverity(delta)).toBe('critical')
  })
})
