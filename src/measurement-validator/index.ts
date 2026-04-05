// Public surface for the measurement-validator tools.
//
// Import specific modules directly for tree-shaking:
//   import { ResultsDatabase } from './src/measurement-validator/results-database.js'
//   import { DashboardServer } from './src/measurement-validator/dashboard-server.js'
//   import { SlackNotifier } from './src/measurement-validator/slack-notifier.js'
//   import { detectRegressions } from './src/measurement-validator/performance-tracker.js'

export type {
  DatabaseQueryOptions,
  MeasurementResult,
  PerformanceBaseline,
  PerformanceMetrics,
  PerformanceRegression,
  Severity,
  SlackAttachment,
  SlackBlock,
  SlackMessage,
  ValidationRun,
  ValidationSummary,
} from './types.js'

export {
  baselineKey,
  buildBaselineEntry,
  createBaseline,
  createTrackingSession,
  detectRegressions,
  finalizeSession,
  formatRegressionReport,
  loadBaseline,
  recordSample,
  saveBaseline,
  updateBaselineEntry,
} from './performance-tracker.js'

export { ResultsDatabase } from './results-database.js'

export { DashboardServer } from './dashboard-server.js'
export type { DashboardServerConfig } from './dashboard-server.js'

export {
  SlackNotifier,
  createSlackNotifierFromEnv,
} from './slack-notifier.js'
export type { SlackNotifierConfig, SlackNotifierOptions } from './slack-notifier.js'
