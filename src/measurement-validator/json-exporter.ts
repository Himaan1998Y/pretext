// JSON exporter for ValidationReport.
//
// Produces a machine-readable JSON file with full metadata, summary
// statistics, and all individual validation results. Suitable for
// downstream automation, dashboards, and data analysis pipelines.

import type { ValidationReport, ValidationResult } from './types.ts'
import { buildSummary } from './report-formatter.ts'

/**
 * Serialize a set of validation results to a complete JSON report document.
 *
 * @param results   - Validation results to include.
 * @param indented  - Whether to pretty-print; defaults to `true`.
 * @returns         - JSON string ready to write to a file.
 */
export function exportJSON(results: ValidationResult[], indented = true): string {
  const report: ValidationReport = {
    metadata: {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      totalSamples: results.length,
      tool: '@chenglou/pretext measurement-validator',
    },
    summary: buildSummary(results),
    results,
  }
  return JSON.stringify(report, null, indented ? 2 : undefined)
}
