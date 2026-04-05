// CSV exporter for validation results.
//
// Produces UTF-8 BOM-encoded CSV compatible with Excel, Google Sheets, and
// LibreOffice. All text fields are properly escaped (quotes doubled, newlines
// stripped). Numeric fields are emitted without quoting so spreadsheet apps
// parse them as numbers.

import type { ValidationResult } from './types.ts'

const BOM = '\uFEFF'

const HEADERS: ReadonlyArray<string> = [
  'ID',
  'Text',
  'Font',
  'FontSize',
  'ContainerWidth',
  'PretextWidth',
  'DOMWidth',
  'Delta',
  'DeltaPercent',
  'Severity',
  'Language',
  'RootCause',
  'Confidence',
  'Timestamp',
]

/**
 * Escape a value for inclusion in a CSV cell.
 * - Strings are double-quoted; internal `"` are doubled.
 * - Newlines are replaced with a space to avoid multi-line cell issues.
 * - Numbers are emitted as-is (no quoting) so spreadsheets see them as numbers.
 */
function csvCell(value: string | number): string {
  if (typeof value === 'number') {
    return isFinite(value) ? String(value) : '0'
  }
  // Normalize line endings then escape
  const clean = value.replace(/\r\n|\r|\n/g, ' ')
  return `"${clean.replace(/"/g, '""')}"`
}

/** Round to 4 decimal places to avoid floating-point noise in exports. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * Serialize validation results to an Excel-compatible CSV string.
 * The string begins with a UTF-8 BOM so that Excel auto-detects the encoding.
 */
export function exportCSV(results: ValidationResult[]): string {
  const rows: string[] = [BOM + HEADERS.join(',')]

  for (const r of results) {
    const row = [
      csvCell(r.id),
      csvCell(r.text),
      csvCell(r.font),
      csvCell(r.fontSize),
      csvCell(r.containerWidth),
      csvCell(round4(r.pretextWidth)),
      csvCell(round4(r.domWidth)),
      csvCell(round4(r.delta)),
      csvCell(round4(r.deltaPercent)),
      csvCell(r.severity),
      csvCell(r.language),
      csvCell(r.rootCause),
      csvCell(round4(r.confidence)),
      csvCell(r.timestamp),
    ]
    rows.push(row.join(','))
  }

  return rows.join('\r\n')
}
