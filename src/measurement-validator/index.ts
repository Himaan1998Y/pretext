// Public API surface for the measurement-validator module.
// Re-exports the primary types, utilities, and Phase 4 infrastructure.

export type {
  BaselineEntry,
  DivergenceAnalysis,
  DivergenceReason,
  Language,
  LanguageBreakdown,
  MeasurementResult,
  PerformanceMetrics,
  RegressionResult,
  RegressionSeverity,
  ReportFormat,
  ReportOptions,
  Severity,
  ValidationOptions,
  ValidationSummary,
} from './types.js'

export { compareMeasurement, validateSamples } from './comparator.js'

export {
  analyzeDivergence,
  analyzeAll,
  buildLanguageBreakdown,
  buildSummary,
} from './classifier.js'

export { exportToCsv } from './csv-exporter.js'
export { exportToMarkdown } from './markdown-exporter.js'
export { exportToHtml } from './html-report.js'

export { computeMetrics, metricsToBaseline, compareToBaseline } from './performance-tracker.js'

export {
  detectRegressions,
  hasCriticalRegressions,
  summarizeRegressions,
} from './regression-detector.js'

export { MeasurementDatabase } from './database.js'
export { SlackNotifier } from './slack-notifier.js'
export { DashboardServer } from './dashboard-server.js'
