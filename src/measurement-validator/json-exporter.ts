import type { MeasurementResult } from './types.js'

export function exportToJSON(results: MeasurementResult[]): string {
  return JSON.stringify(results, null, 2)
}
