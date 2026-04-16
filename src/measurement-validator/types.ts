// Core types for the measurement validator system.
// Provides shared type definitions used across all measurement-validator modules.

export type Language =
  | 'en'
  | 'ar'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'th'
  | 'hi'
  | 'ru'
  | 'he'
  | 'fa'
  | 'tr'
  | 'de'
  | 'fr'
  | 'es'
  | 'pt'
  | 'it'
  | 'nl'
  | 'pl'
  | 'uk'
  | 'vi'
  // Accept any additional BCP-47 language tag while still providing autocomplete for the above.
  | (string & Record<never, never>)

export type DivergenceReason =
  | 'font_fallback'
  | 'bidi_reorder'
  | 'emoji_width'
  | 'browser_quirk'
  | 'tab_width'
  | 'soft_hyphen'
  | 'line_break_policy'
  | 'whitespace_collapse'
  | 'unknown'

export type Severity = 'pass' | 'warning' | 'critical'

export type MeasurementResult = {
  id: string
  language: Language
  font: string
  fontSize: number
  text: string
  containerWidth: number
  canvasLineCount: number
  domLineCount: number
  diverged: boolean
  divergencePixels: number
  severity: Severity
  reason: DivergenceReason
  timestamp: number
  durationMs: number
}

export type DivergenceAnalysis = {
  result: MeasurementResult
  details: string
  suggestion: string
}

export type LanguageBreakdown = {
  language: Language
  total: number
  passed: number
  warnings: number
  criticals: number
  passRate: number
  avgDivergencePixels: number
}

export type ValidationSummary = {
  total: number
  passed: number
  warnings: number
  criticals: number
  passRate: number
  byLanguage: LanguageBreakdown[]
  durationMs: number
  timestamp: number
}

export type PerformanceMetrics = {
  language: Language
  sampleCount: number
  avgMs: number
  minMs: number
  maxMs: number
  medianMs: number
  p95Ms: number
  p99Ms: number
}

export type BaselineEntry = {
  language: Language
  avgMs: number
  p95Ms: number
  p99Ms: number
  passRate: number
  recordedAt: number
  version: string
}

export type RegressionSeverity = 'minor' | 'major' | 'critical'

export type RegressionResult = {
  language: Language
  metric: keyof PerformanceMetrics
  baseline: number
  current: number
  changePercent: number
  severity: RegressionSeverity
  message: string
}

export type ValidationOptions = {
  language?: Language | Language[]
  severity?: Severity
  font?: string
  fontSize?: number
  containerWidth?: number
  timeout?: number
  stream?: boolean
}

export type ReportFormat = 'csv' | 'markdown' | 'html' | 'json'

export type ReportOptions = {
  format: ReportFormat
  output?: string
  includeDetails?: boolean
}
