// Public exports for the measurement-validator module.
//
// Phase 1 & 2: Core validation infrastructure.
// Phase 3: Report generation and CLI support (html-report-generator,
//           csv-exporter, markdown-exporter, json-exporter, report-formatter).

export type {
  LanguageCategory,
  LanguageSummary,
  MeasurementPair,
  MeasurementSample,
  RootCause,
  Severity,
  ValidationReport,
  ValidationResult,
  ValidationSummary,
} from './types.ts'

export {
  classifyLanguage,
  classifyRootCause,
  isRTL,
} from './classifier.ts'

export {
  compareWidths,
  deltaSeverity,
  formatRootCause,
  formatSeverity,
  isPassing,
} from './comparator.ts'

export { generateHTMLReport } from './html-report-generator.ts'
export { exportCSV } from './csv-exporter.ts'
export { exportMarkdown } from './markdown-exporter.ts'
export { exportJSON } from './json-exporter.ts'
export { ReportFormatter } from './report-formatter.ts'
