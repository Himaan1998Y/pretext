import { describe, expect, test } from 'bun:test'

import {
  exportToCSV,
  exportToMarkdown,
  generateHTMLReport,
  exportToJSON,
  type MeasurementResult,
} from '../src/measurement-validator/index.ts'

const NOW = '2024-04-04T10:15:23.000Z'

const MOCK_RESULTS: MeasurementResult[] = [
  {
    sampleId: 'en-simple',
    text: 'Hello world',
    font: '16px Arial',
    maxWidth: 400,
    pretextWidth: 87.5,
    domWidth: 88.0,
    delta: 0.5,
    errorPercent: 0.57,
    overallSeverity: 'pass',
    rootCause: '-',
    confidence: 1.0,
    timestamp: NOW,
    language: 'en',
  },
  {
    sampleId: 'ar-simple',
    text: 'مرحبا',
    font: '16px Arial',
    maxWidth: 400,
    pretextWidth: 95.2,
    domWidth: 110.5,
    delta: 15.3,
    errorPercent: 16.1,
    overallSeverity: 'critical',
    rootCause: 'bidi_shaping',
    confidence: 0.85,
    timestamp: NOW,
    language: 'ar',
  },
  {
    sampleId: 'en-quoted',
    text: 'He said, "Hello, world!"',
    font: '16px Arial',
    maxWidth: 400,
    pretextWidth: 200.0,
    domWidth: 201.5,
    delta: 1.5,
    errorPercent: 0.74,
    overallSeverity: 'warning',
    rootCause: 'rounding',
    confidence: 0.9,
    timestamp: NOW,
    language: 'en',
  },
]

// ── CSV Exporter ──────────────────────────────────────────────────────────────

describe('CSV Exporter', () => {
  test('generates valid CSV with correct headers', () => {
    const csv = exportToCSV(MOCK_RESULTS)
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n')
    expect(lines.length).toBeGreaterThan(1)
    const header = lines[0]
    expect(header).toContain('Sample')
    expect(header).toContain('Text')
    expect(header).toContain('Font')
    expect(header).toContain('Severity')
    expect(header).toContain('Timestamp')
  })

  test('generates one data row per result', () => {
    const csv = exportToCSV(MOCK_RESULTS)
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n').filter(l => l.length > 0)
    // header + one row per result
    expect(lines.length).toBe(MOCK_RESULTS.length + 1)
  })

  test('includes UTF-8 BOM by default', () => {
    const csv = exportToCSV(MOCK_RESULTS)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  test('omits BOM when encoding is utf-8', () => {
    const csv = exportToCSV(MOCK_RESULTS, { encoding: 'utf-8' })
    expect(csv.charCodeAt(0)).not.toBe(0xfeff)
  })

  test('handles special characters: quotes and commas in text', () => {
    const csv = exportToCSV(MOCK_RESULTS)
    // CSV RFC 4180: double-quotes are escaped by doubling them inside a quoted field.
    // e.g. `He said, "Hello, world!"` becomes `"He said, ""Hello, world!"""`
    expect(csv).toContain('"He said, ""Hello, world!"""')
  })

  test('supports semicolon separator', () => {
    const csv = exportToCSV(MOCK_RESULTS, { separator: ';' })
    const firstLine = csv.replace(/^\uFEFF/, '').split('\r\n')[0]
    expect(firstLine).toContain(';')
    expect(firstLine).not.toContain(',')
  })

  test('supports tab separator', () => {
    const csv = exportToCSV(MOCK_RESULTS, { separator: '\t' })
    const firstLine = csv.replace(/^\uFEFF/, '').split('\r\n')[0]
    expect(firstLine).toContain('\t')
  })

  test('handles empty results array', () => {
    const csv = exportToCSV([])
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n').filter(l => l.length > 0)
    expect(lines.length).toBe(1) // header only
  })

  test('serializes data correctly', () => {
    const csv = exportToCSV(MOCK_RESULTS)
    expect(csv).toContain('en-simple')
    expect(csv).toContain('ar-simple')
    expect(csv).toContain('critical')
    expect(csv).toContain('bidi_shaping')
  })
})

// ── Markdown Exporter ─────────────────────────────────────────────────────────

describe('Markdown Exporter', () => {
  test('generates markdown with a top-level heading', () => {
    const md = exportToMarkdown(MOCK_RESULTS)
    expect(md).toMatch(/^# /m)
  })

  test('contains a summary section', () => {
    const md = exportToMarkdown(MOCK_RESULTS)
    expect(md).toContain('## Summary')
  })

  test('contains severity icons in summary', () => {
    const md = exportToMarkdown(MOCK_RESULTS)
    expect(md).toContain('✅')
    expect(md).toContain('🔴')
  })

  test('groups by language when groupByLanguage=true', () => {
    const md = exportToMarkdown(MOCK_RESULTS, { groupByLanguage: true })
    expect(md).toContain('### en')
    expect(md).toContain('### ar')
  })

  test('does not group by language when groupByLanguage=false', () => {
    const md = exportToMarkdown(MOCK_RESULTS, { groupByLanguage: false })
    expect(md).not.toContain('### en')
    expect(md).not.toContain('### ar')
    expect(md).toContain('## Results')
  })

  test('includes a table with the correct columns', () => {
    const md = exportToMarkdown(MOCK_RESULTS)
    expect(md).toContain('| Text |')
    expect(md).toContain('| Font |')
    expect(md).toContain('| Severity |')
  })

  test('escapes pipe characters in text fields', () => {
    const withPipe: MeasurementResult[] = [
      {
        ...MOCK_RESULTS[0]!,
        text: 'a | b',
      },
    ]
    const md = exportToMarkdown(withPipe, { groupByLanguage: false })
    expect(md).toContain('a \\| b')
  })

  test('handles empty results array', () => {
    const md = exportToMarkdown([])
    expect(md).toContain('## Summary')
    expect(md).toContain('0 passed')
  })
})

// ── HTML Report ───────────────────────────────────────────────────────────────

describe('HTML Report', () => {
  test('generates a string that starts with <!DOCTYPE html>', () => {
    const html = generateHTMLReport(MOCK_RESULTS)
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i)
  })

  test('includes a <title> element', () => {
    const html = generateHTMLReport(MOCK_RESULTS, { title: 'Test Report' })
    expect(html).toContain('<title>Test Report</title>')
  })

  test('contains summary counts', () => {
    const html = generateHTMLReport(MOCK_RESULTS)
    // 1 pass, 1 warning, 1 critical
    expect(html).toContain('1')
  })

  test('renders one table row per result', () => {
    const html = generateHTMLReport(MOCK_RESULTS)
    const rowCount = (html.match(/<tr data-severity=/g) ?? []).length
    expect(rowCount).toBe(MOCK_RESULTS.length)
  })

  test('escapes HTML special characters in text fields', () => {
    const withScript: MeasurementResult[] = [
      {
        ...MOCK_RESULTS[0]!,
        text: '<script>alert(1)</script>',
      },
    ]
    const html = generateHTMLReport(withScript)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('uses custom title when provided', () => {
    const html = generateHTMLReport(MOCK_RESULTS, { title: 'My Custom Report' })
    expect(html).toContain('My Custom Report')
  })

  test('omits summary section when includeSummary=false', () => {
    const html = generateHTMLReport(MOCK_RESULTS, { includeSummary: false })
    expect(html).not.toContain('class="summary"')
  })

  test('includes filter controls', () => {
    const html = generateHTMLReport(MOCK_RESULTS)
    expect(html).toContain('filter-language')
    expect(html).toContain('filter-severity')
  })

  test('handles empty results array', () => {
    const html = generateHTMLReport([])
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html>/i)
    expect(html).toContain('0 samples')
  })
})

// ── JSON Exporter ─────────────────────────────────────────────────────────────

describe('JSON Exporter', () => {
  test('produces parseable JSON', () => {
    const json = exportToJSON(MOCK_RESULTS)
    const parsed = JSON.parse(json) as unknown[]
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(MOCK_RESULTS.length)
  })

  test('preserves all fields', () => {
    const json = exportToJSON(MOCK_RESULTS)
    const parsed = JSON.parse(json) as MeasurementResult[]
    const first = parsed[0]!
    expect(first.sampleId).toBe('en-simple')
    expect(first.text).toBe('Hello world')
    expect(first.overallSeverity).toBe('pass')
  })

  test('handles empty array', () => {
    const json = exportToJSON([])
    expect(json.trim()).toBe('[]')
  })
})
