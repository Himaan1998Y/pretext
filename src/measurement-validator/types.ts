// Shared types for the measurement validator module.

export type MeasurementSeverity = 'pass' | 'warning' | 'error' | 'critical'

export interface MeasurementResult {
  /** Short identifier for the test sample (e.g. "en-simple"). */
  sampleId: string
  /** The text that was measured. */
  text: string
  /** CSS font descriptor used for measuring (e.g. "16px Arial"). */
  font: string
  /** Maximum container width in pixels that was tested. */
  maxWidth: number
  /** Width reported by the pretext engine in pixels. */
  pretextWidth: number
  /** Width measured from the DOM in pixels. */
  domWidth: number
  /** Absolute difference (domWidth - pretextWidth). */
  delta: number
  /** Percentage error relative to domWidth. */
  errorPercent: number
  /** Overall severity classification. */
  overallSeverity: MeasurementSeverity
  /** Human-readable root-cause label, or "-" when exact. */
  rootCause: string
  /** Confidence in the root-cause classification (0–1). */
  confidence: number
  /** ISO 8601 timestamp of when this measurement was taken. */
  timestamp: string
  /** BCP-47 language tag inferred from the sample (e.g. "en", "ar"). */
  language: string
}

export interface ReportSummary {
  total: number
  passed: number
  warnings: number
  errors: number
  critical: number
  passRate: number
}

export interface LanguageStats {
  language: string
  total: number
  passed: number
  warnings: number
  errors: number
  critical: number
}
