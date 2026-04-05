// Core types for the measurement-validator tool.
//
// The measurement-validator compares Pretext's canvas-based width predictions
// against real browser DOM measurements to track accuracy, detect regressions,
// and monitor performance over time.

export type Severity = 'ok' | 'warning' | 'critical'

export type MeasurementResult = {
  id: string
  timestamp: number
  language: string
  font: string
  fontSize: number
  text: string
  pretextWidth: number
  domWidth: number
  delta: number
  deltaPercent: number
  severity: Severity
  rootCause?: string
  metadata?: Record<string, unknown>
}

export type ValidationRun = {
  id: string
  timestamp: number
  commitSha?: string
  branch?: string
  results: MeasurementResult[]
  summary: ValidationSummary
  durationMs: number
}

export type ValidationSummary = {
  total: number
  passed: number
  warnings: number
  critical: number
  passRate: number
  avgDeltaPercent: number
  maxDeltaPercent: number
}

export type PerformanceMetrics = {
  language: string
  font: string
  prepareMs: number
  layoutMs: number
  totalMs: number
  measurementCount: number
  avgMsPerMeasurement: number
}

export type PerformanceBaseline = {
  version: string
  createdAt: number
  updatedAt: number
  commitSha?: string
  metrics: Record<string, BaselineEntry>
}

export type BaselineEntry = {
  avgPrepareMs: number
  avgLayoutMs: number
  avgTotalMs: number
  p95PrepareMs: number
  p95LayoutMs: number
  p95TotalMs: number
  sampleCount: number
  capturedAt: number
}

export type PerformanceRegression = {
  language: string
  metric: keyof Pick<BaselineEntry, 'avgTotalMs' | 'p95TotalMs'>
  baselineMs: number
  currentMs: number
  changePercent: number
  severity: 'warning' | 'critical'
}

export type DatabaseQueryOptions = {
  language?: string
  font?: string
  severity?: Severity
  since?: number
  until?: number
  limit?: number
  offset?: number
}

export type SlackMessage = {
  text: string
  attachments?: SlackAttachment[]
  blocks?: SlackBlock[]
}

export type SlackAttachment = {
  color: string
  title: string
  text: string
  fields?: Array<{ title: string; value: string; short: boolean }>
  footer?: string
  ts?: number
}

export type SlackBlock =
  | { type: 'header'; text: { type: 'plain_text'; text: string } }
  | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
  | { type: 'divider' }
