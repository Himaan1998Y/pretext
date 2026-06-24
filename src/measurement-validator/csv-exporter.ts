import type { MeasurementResult } from './types.js'

export interface CSVExportOptions {
  includeDetails?: boolean
  separator?: ',' | ';' | '\t'
  encoding?: 'utf-8' | 'utf-8-bom'
}

const HEADERS = [
  'Sample',
  'Text',
  'Font',
  'MaxWidth',
  'PretextWidth',
  'DOMWidth',
  'Delta',
  'ErrorPercent',
  'Severity',
  'RootCause',
  'Confidence',
  'Language',
  'Timestamp',
]

function escapeCSVField(value: string, separator: string): string {
  // Always quote if contains separator, double-quote, newline, or carriage return.
  if (
    value.includes(separator) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

export function exportToCSV(
  results: MeasurementResult[],
  options: CSVExportOptions = {},
): string {
  const sep = options.separator ?? ','
  const encoding = options.encoding ?? 'utf-8-bom'

  const bom = encoding === 'utf-8-bom' ? '\uFEFF' : ''

  const escape = (v: string) => escapeCSVField(v, sep)

  const header = HEADERS.map(h => escape(h)).join(sep)

  const rows = results.map(r => {
    const fields = [
      r.sampleId,
      r.text,
      r.font,
      String(r.maxWidth),
      String(r.pretextWidth),
      String(r.domWidth),
      String(r.delta),
      r.errorPercent.toFixed(2) + '%',
      r.overallSeverity,
      r.rootCause,
      String(r.confidence),
      r.language,
      r.timestamp,
    ]
    return fields.map(f => escape(f)).join(sep)
  })

  return bom + [header, ...rows].join('\r\n')
}
