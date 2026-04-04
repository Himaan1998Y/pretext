// Public API for the Measurement Validator module.
//
// Usage example (browser environment):
//
//   import { compare, compareAll, buildReport, printReport } from '@chenglou/pretext/measurement-validator'
//
//   const result = await compare({ text: 'Hello world', font: '16px Arial', maxWidth: 200 })
//   console.log(result.metrics.severity) // 'exact' | 'minor' | 'major' | 'critical'
//
//   const report = buildReport([result])
//   printReport(report)

export { compare, compareAll } from './comparator.js'
export { measureDOM } from './dom-adapter.js'
export { buildReport, printReport, toConsoleText, toJSON } from './report-generator.js'
export {
  classifySeverity,
  THRESHOLD_EXACT,
  THRESHOLD_MAJOR,
  THRESHOLD_MINOR,
  type ComparisonResult,
  type DivergenceMetrics,
  type DOMMeasurement,
  type DOMLine,
  type LineComparison,
  type MeasurementSample,
  type ReportSummary,
  type Severity,
  type TextDirection,
  type ValidationReport,
  type WhiteSpaceMode,
  type WordBreakMode,
} from './types.js'
