// CSV exporter for measurement results.
// Produces Excel-compatible UTF-8 CSV (with BOM) from MeasurementResult arrays.

import type { MeasurementResult, ValidationSummary } from './types.js'

const BOM = '\uFEFF'

const HEADERS = [
  'ID',
  'Language',
  'Font',
  'FontSize',
  'ContainerWidth',
  'CanvasLines',
  'DOMLines',
  'Diverged',
  'DivergencePixels',
  'Severity',
  'Reason',
  'DurationMs',
  'Timestamp',
  'Text',
]

function csvEscape(value: string | number | boolean): string {
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function resultToRow(r: MeasurementResult): string {
  return [
    r.id,
    r.language,
    r.font,
    r.fontSize,
    r.containerWidth,
    r.canvasLineCount,
    r.domLineCount,
    r.diverged,
    r.divergencePixels.toFixed(2),
    r.severity,
    r.reason,
    r.durationMs.toFixed(2),
    new Date(r.timestamp).toISOString(),
    r.text,
  ]
    .map(csvEscape)
    .join(',')
}

export function exportToCsv(
  results: MeasurementResult[],
  _summary?: ValidationSummary
): string {
  const header = HEADERS.map(csvEscape).join(',')
  const rows = results.map(resultToRow)
  return BOM + [header, ...rows].join('\n') + '\n'
}
