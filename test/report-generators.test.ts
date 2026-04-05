import { describe, expect, test } from 'bun:test'
import { ReportFormatter } from '../src/measurement-validator/report-formatter.ts'
import { exportCSV } from '../src/measurement-validator/csv-exporter.ts'
import { exportMarkdown } from '../src/measurement-validator/markdown-exporter.ts'
import { exportJSON } from '../src/measurement-validator/json-exporter.ts'
import { generateHTMLReport } from '../src/measurement-validator/html-report-generator.ts'
import { compareWidths } from '../src/measurement-validator/comparator.ts'
import { classifyLanguage, classifyRootCause } from '../src/measurement-validator/classifier.ts'
import type { ValidationResult, MeasurementPair } from '../src/measurement-validator/types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(
  overrides: Partial<ValidationResult> = {},
): ValidationResult {
  return {
    id: 'test-01',
    text: 'Hello world',
    font: 'Arial',
    fontSize: 16,
    containerWidth: 400,
    pretextWidth: 87.5,
    domWidth: 88.0,
    delta: -0.5,
    deltaPercent: 0.57,
    severity: 'exact',
    language: 'english',
    rootCause: 'none',
    confidence: 1.0,
    timestamp: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeArabicResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return makeResult({
    id: 'ar-01',
    text: 'مرحبا بالعالم',
    language: 'arabic',
    pretextWidth: 95.2,
    domWidth: 110.5,
    delta: -15.3,
    deltaPercent: 13.85,
    severity: 'critical',
    rootCause: 'bidi_shaping',
    confidence: 0.85,
    ...overrides,
  })
}

const SAMPLE_RESULTS: ValidationResult[] = [
  makeResult({ id: 'en-01', severity: 'exact', delta: -0.3, language: 'english' }),
  makeResult({ id: 'en-02', severity: 'close', delta: 1.5, language: 'english' }),
  makeResult({ id: 'en-03', severity: 'warning', delta: 3.5, language: 'english', rootCause: 'browser_quirk' }),
  makeArabicResult({ id: 'ar-01', severity: 'error', delta: -8.0, language: 'arabic' }),
  makeArabicResult({ id: 'ar-02', severity: 'critical', delta: -20.0, language: 'arabic' }),
  makeResult({ id: 'zh-01', text: '你好', language: 'chinese', severity: 'close', delta: 1.0, rootCause: 'none' }),
]

// ---------------------------------------------------------------------------
// Classifier tests
// ---------------------------------------------------------------------------

describe('classifyLanguage', () => {
  test('detects English', () => {
    expect(classifyLanguage('Hello world')).toBe('english')
  })

  test('detects Arabic', () => {
    expect(classifyLanguage('مرحبا بالعالم')).toBe('arabic')
  })

  test('detects Hebrew', () => {
    expect(classifyLanguage('שלום עולם')).toBe('hebrew')
  })

  test('detects Chinese', () => {
    expect(classifyLanguage('你好世界')).toBe('chinese')
  })

  test('detects Japanese via kana', () => {
    expect(classifyLanguage('こんにちは')).toBe('japanese')
  })

  test('detects Korean', () => {
    expect(classifyLanguage('안녕하세요')).toBe('korean')
  })

  test('detects Thai', () => {
    expect(classifyLanguage('สวัสดี')).toBe('thai')
  })

  test('returns unknown for empty string', () => {
    expect(classifyLanguage('')).toBe('unknown')
  })

  test('detects mixed script', () => {
    expect(classifyLanguage('Hello مرحبا')).toBe('mixed')
  })
})

describe('classifyRootCause', () => {
  test('returns none for exact severity', () => {
    const { rootCause } = classifyRootCause('Hello', 'english', 'exact')
    expect(rootCause).toBe('none')
  })

  test('returns none for close severity', () => {
    const { rootCause } = classifyRootCause('Hello', 'english', 'close')
    expect(rootCause).toBe('none')
  })

  test('returns bidi_shaping for Arabic error', () => {
    const { rootCause, confidence } = classifyRootCause('مرحبا', 'arabic', 'error')
    expect(rootCause).toBe('bidi_shaping')
    expect(confidence).toBeGreaterThan(0.8)
  })

  test('returns bidi_shaping for Hebrew', () => {
    const { rootCause } = classifyRootCause('שלום', 'hebrew', 'warning')
    expect(rootCause).toBe('bidi_shaping')
  })

  test('returns emoji_correction when emoji present', () => {
    const { rootCause } = classifyRootCause('Hello 😀', 'english', 'warning')
    expect(rootCause).toBe('emoji_correction')
  })

  test('returns browser_quirk for English warning', () => {
    const { rootCause } = classifyRootCause('Hello', 'english', 'warning')
    expect(rootCause).toBe('browser_quirk')
  })
})

// ---------------------------------------------------------------------------
// Comparator tests
// ---------------------------------------------------------------------------

describe('compareWidths', () => {
  function makePair(pretextWidth: number, domWidth: number): MeasurementPair {
    return {
      sample: {
        id: 'test',
        text: 'Hello',
        font: 'Arial',
        fontSize: 16,
        containerWidth: 400,
      },
      pretextWidth,
      domWidth,
    }
  }

  test('produces exact severity for sub-0.5px delta', () => {
    const r = compareWidths(makePair(88.0, 88.3))
    expect(r.severity).toBe('exact')
  })

  test('produces close severity for 1-2px delta', () => {
    const r = compareWidths(makePair(88.0, 89.5))
    expect(r.severity).toBe('close')
  })

  test('produces warning severity for 3-5px delta', () => {
    const r = compareWidths(makePair(88.0, 91.5))
    expect(r.severity).toBe('warning')
  })

  test('produces error severity for 6-15px delta', () => {
    const r = compareWidths(makePair(88.0, 100.0))
    expect(r.severity).toBe('error')
  })

  test('produces critical severity for >15px delta', () => {
    const r = compareWidths(makePair(88.0, 120.0))
    expect(r.severity).toBe('critical')
  })

  test('populates all required fields', () => {
    const r = compareWidths(makePair(100, 105))
    expect(r.id).toBe('test')
    expect(r.delta).toBeCloseTo(-5)
    expect(r.deltaPercent).toBeCloseTo(4.76, 1)
    expect(r.language).toBe('english')
    expect(r.timestamp).toBeTruthy()
  })

  test('uses provided timestamp', () => {
    const ts = '2024-06-15T12:00:00.000Z'
    const r = compareWidths(makePair(100, 100), ts)
    expect(r.timestamp).toBe(ts)
  })
})

// ---------------------------------------------------------------------------
// CSV exporter tests
// ---------------------------------------------------------------------------

describe('exportCSV', () => {
  test('starts with UTF-8 BOM', () => {
    const csv = exportCSV([makeResult()])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  test('first non-BOM row is header', () => {
    const csv = exportCSV([makeResult()])
    const lines = csv.split('\r\n')
    const header = lines[0]?.replace('\uFEFF', '') ?? ''
    expect(header).toContain('ID')
    expect(header).toContain('Text')
    expect(header).toContain('Severity')
    expect(header).toContain('Language')
    expect(header).toContain('RootCause')
  })

  test('has one data row per result', () => {
    const csv = exportCSV(SAMPLE_RESULTS)
    const lines = csv.split('\r\n').filter((l) => l.length > 0)
    // header + N data rows
    expect(lines.length).toBe(SAMPLE_RESULTS.length + 1)
  })

  test('escapes double quotes in text', () => {
    const result = makeResult({ text: 'Say "hello"' })
    const csv = exportCSV([result])
    expect(csv).toContain('""hello""')
  })

  test('replaces newlines in text', () => {
    const result = makeResult({ text: 'line1\nline2' })
    const csv = exportCSV([result])
    expect(csv).not.toContain('\nline2')
    expect(csv).toContain('line1 line2')
  })

  test('uses CRLF line endings', () => {
    const csv = exportCSV([makeResult()])
    expect(csv).toContain('\r\n')
  })

  test('exports empty array as header-only', () => {
    const csv = exportCSV([])
    const lines = csv.split('\r\n').filter((l) => l.length > 0)
    expect(lines.length).toBe(1) // header only
  })
})

// ---------------------------------------------------------------------------
// Markdown exporter tests
// ---------------------------------------------------------------------------

describe('exportMarkdown', () => {
  test('starts with h1 header', () => {
    const md = exportMarkdown(SAMPLE_RESULTS)
    expect(md).toMatch(/^# Measurement Validator Report/)
  })

  test('contains summary section', () => {
    const md = exportMarkdown(SAMPLE_RESULTS)
    expect(md).toContain('## Summary')
  })

  test('contains results by language section', () => {
    const md = exportMarkdown(SAMPLE_RESULTS)
    expect(md).toContain('## Results by Language')
  })

  test('contains per-language sub-headings', () => {
    const md = exportMarkdown(SAMPLE_RESULTS)
    expect(md).toContain('### English')
    expect(md).toContain('### Arabic')
    expect(md).toContain('### Chinese')
  })

  test('contains severity emoji indicators', () => {
    const md = exportMarkdown(SAMPLE_RESULTS)
    expect(md).toContain('✅')
    expect(md).toContain('❌')
  })

  test('uses markdown table syntax', () => {
    const md = exportMarkdown(SAMPLE_RESULTS)
    expect(md).toContain('|---|')
  })

  test('escapes pipe chars in text cells', () => {
    const result = makeResult({ text: 'a|b|c' })
    const md = exportMarkdown([result])
    expect(md).toContain('a\\|b\\|c')
  })

  test('exports empty array gracefully', () => {
    const md = exportMarkdown([])
    expect(md).toContain('# Measurement Validator Report')
    expect(md).toContain('## Summary')
  })
})

// ---------------------------------------------------------------------------
// HTML report generator tests
// ---------------------------------------------------------------------------

describe('generateHTMLReport', () => {
  test('produces valid HTML skeleton', () => {
    const html = generateHTMLReport(SAMPLE_RESULTS)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('</html>')
  })

  test('is self-contained (no external links)', () => {
    const html = generateHTMLReport(SAMPLE_RESULTS)
    // No CDN or external stylesheet/script references
    expect(html).not.toContain('https://cdn')
    expect(html).not.toContain('<link rel=')
    expect(html).not.toContain('src="http')
  })

  test('contains summary cards', () => {
    const html = generateHTMLReport(SAMPLE_RESULTS)
    expect(html).toContain('Pass rate')
    expect(html).toContain('Total')
  })

  test('contains filter controls', () => {
    const html = generateHTMLReport(SAMPLE_RESULTS)
    expect(html).toContain('id="f-severity"')
    expect(html).toContain('id="f-language"')
    expect(html).toContain('id="f-font"')
  })

  test('contains result table rows', () => {
    const html = generateHTMLReport(SAMPLE_RESULTS)
    expect(html).toContain('id="tbody"')
    // Each result should have a row
    for (const r of SAMPLE_RESULTS) {
      expect(html).toContain(r.id)
    }
  })

  test('escapes HTML special characters in text', () => {
    const result = makeResult({ text: '<script>alert("xss")</script>' })
    const html = generateHTMLReport([result])
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  test('embeds client-side JS for filtering', () => {
    const html = generateHTMLReport(SAMPLE_RESULTS)
    expect(html).toContain('applyFilters')
    expect(html).toContain('sortBy')
  })

  test('exports empty array gracefully', () => {
    const html = generateHTMLReport([])
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('0 samples')
  })
})

// ---------------------------------------------------------------------------
// JSON exporter tests
// ---------------------------------------------------------------------------

describe('exportJSON', () => {
  test('produces valid JSON', () => {
    const json = exportJSON(SAMPLE_RESULTS)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  test('includes metadata block', () => {
    const parsed = JSON.parse(exportJSON(SAMPLE_RESULTS)) as { metadata: unknown }
    expect(parsed.metadata).toBeDefined()
  })

  test('includes summary block', () => {
    const parsed = JSON.parse(exportJSON(SAMPLE_RESULTS)) as { summary: { total: number } }
    expect(parsed.summary.total).toBe(SAMPLE_RESULTS.length)
  })

  test('includes results array', () => {
    const parsed = JSON.parse(exportJSON(SAMPLE_RESULTS)) as {
      results: ValidationResult[]
    }
    expect(parsed.results.length).toBe(SAMPLE_RESULTS.length)
  })

  test('compact mode produces single-line JSON', () => {
    const json = exportJSON([makeResult()], false)
    expect(json).not.toContain('\n  ')
  })

  test('exports empty array gracefully', () => {
    const parsed = JSON.parse(exportJSON([])) as { summary: { total: number } }
    expect(parsed.summary.total).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// ReportFormatter tests
// ---------------------------------------------------------------------------

describe('ReportFormatter', () => {
  describe('filterByLanguage', () => {
    test('keeps only matching language', () => {
      const fmt = new ReportFormatter(SAMPLE_RESULTS).filterByLanguage('arabic')
      expect(fmt.data.every((r) => r.language === 'arabic')).toBe(true)
      expect(fmt.count).toBe(2)
    })

    test('returns empty formatter for non-existent language', () => {
      const fmt = new ReportFormatter(SAMPLE_RESULTS).filterByLanguage('thai')
      expect(fmt.count).toBe(0)
    })
  })

  describe('filterBySeverity', () => {
    test('keeps results at or above given severity', () => {
      const fmt = new ReportFormatter(SAMPLE_RESULTS).filterBySeverity('error')
      for (const r of fmt.data) {
        expect(['error', 'critical']).toContain(r.severity)
      }
    })

    test('exact keeps everything', () => {
      const fmt = new ReportFormatter(SAMPLE_RESULTS).filterBySeverity('exact')
      expect(fmt.count).toBe(SAMPLE_RESULTS.length)
    })
  })

  describe('filterByFont', () => {
    test('case-insensitive substring match', () => {
      const results = [
        makeResult({ font: '16px Arial' }),
        makeResult({ font: '14px Helvetica' }),
        makeResult({ font: '12px arial bold' }),
      ]
      const fmt = new ReportFormatter(results).filterByFont('arial')
      expect(fmt.count).toBe(2)
    })
  })

  describe('sortByDelta', () => {
    test('sorts descending by default', () => {
      const fmt = new ReportFormatter(SAMPLE_RESULTS).sortByDelta()
      const deltas = fmt.data.map((r) => Math.abs(r.delta))
      for (let i = 1; i < deltas.length; i++) {
        expect(deltas[i - 1]).toBeGreaterThanOrEqual(deltas[i] ?? 0)
      }
    })

    test('sorts ascending when flag is true', () => {
      const fmt = new ReportFormatter(SAMPLE_RESULTS).sortByDelta(true)
      const deltas = fmt.data.map((r) => Math.abs(r.delta))
      for (let i = 1; i < deltas.length; i++) {
        expect(deltas[i - 1]).toBeLessThanOrEqual(deltas[i] ?? Infinity)
      }
    })
  })

  describe('chaining', () => {
    test('does not mutate original results', () => {
      const fmt = new ReportFormatter(SAMPLE_RESULTS)
      fmt.filterByLanguage('arabic').filterBySeverity('critical')
      // Original formatter is unchanged
      expect(fmt.count).toBe(SAMPLE_RESULTS.length)
    })

    test('chains multiple filters', () => {
      const fmt = new ReportFormatter(SAMPLE_RESULTS)
        .filterByLanguage('arabic')
        .filterBySeverity('critical')
      expect(fmt.count).toBe(1)
      expect(fmt.data[0]?.severity).toBe('critical')
    })
  })

  describe('summary', () => {
    test('passRate is 100 when all pass', () => {
      const passing = [
        makeResult({ severity: 'exact' }),
        makeResult({ severity: 'close' }),
      ]
      const s = new ReportFormatter(passing).summary()
      expect(s.passRate).toBe(100)
    })

    test('passRate is 0 when all fail', () => {
      const failing = [
        makeResult({ severity: 'error' }),
        makeResult({ severity: 'critical' }),
      ]
      const s = new ReportFormatter(failing).summary()
      expect(s.passRate).toBe(0)
    })

    test('byLanguage groups correctly', () => {
      const s = new ReportFormatter(SAMPLE_RESULTS).summary()
      expect(s.byLanguage['english']).toBeDefined()
      expect(s.byLanguage['arabic']).toBeDefined()
      expect(s.byLanguage['english']?.total).toBeGreaterThan(0)
    })

    test('returns zero totals for empty set', () => {
      const s = new ReportFormatter([]).summary()
      expect(s.total).toBe(0)
      expect(s.passRate).toBe(0)
    })
  })

  describe('toConsole', () => {
    test('returns non-empty string', () => {
      const output = new ReportFormatter(SAMPLE_RESULTS).toConsole()
      expect(output.trim().length).toBeGreaterThan(0)
    })

    test('no color mode omits ANSI codes', () => {
      const output = new ReportFormatter(SAMPLE_RESULTS).toConsole(false)
      expect(output).not.toContain('\x1b[')
    })

    test('color mode includes ANSI codes', () => {
      const output = new ReportFormatter(SAMPLE_RESULTS).toConsole(true)
      expect(output).toContain('\x1b[')
    })
  })

  describe('toHTML', () => {
    test('delegates to html generator', () => {
      const html = new ReportFormatter(SAMPLE_RESULTS).toHTML()
      expect(html).toContain('<!DOCTYPE html>')
    })
  })

  describe('toCSV', () => {
    test('delegates to csv exporter', () => {
      const csv = new ReportFormatter(SAMPLE_RESULTS).toCSV()
      expect(csv.charCodeAt(0)).toBe(0xfeff)
    })
  })

  describe('toMarkdown', () => {
    test('delegates to markdown exporter', () => {
      const md = new ReportFormatter(SAMPLE_RESULTS).toMarkdown()
      expect(md).toContain('# Measurement Validator Report')
    })
  })

  describe('toJSON', () => {
    test('delegates to json exporter', () => {
      const json = new ReportFormatter(SAMPLE_RESULTS).toJSON()
      const parsed = JSON.parse(json) as { metadata: unknown }
      expect(parsed.metadata).toBeDefined()
    })
  })
})
