// Core types for the measurement validator.
//
// The validator compares Pretext's computed line heights against DOM reference
// measurements. Each sample captures a single text + font + maxWidth combination;
// results are collected into a report.

/** A single text measurement input. */
export type MeasurementSample = {
  /** Human-readable label for diagnostics. */
  label: string
  /** The text string to measure. */
  text: string
  /** CSS font shorthand, e.g. "16px sans-serif". */
  font: string
  /** Container width in pixels. */
  maxWidth: number
  /** Line height in pixels used for Pretext layout. */
  lineHeight: number
  /** Optional language tag for Intl.Segmenter locale, e.g. "ar", "ja". */
  language?: string | undefined
}

/** Severity of a measurement divergence. */
export type DivergenceSeverity =
  | 'exact'    // diffPx <= 1px
  | 'minor'    // 1px < diffPx <= 4px
  | 'major'    // 4px < diffPx <= 20px
  | 'critical' // diffPx > 20px

/** Result of comparing Pretext height against a DOM reference height. */
export type ComparisonResult = {
  sample: MeasurementSample
  /** Height predicted by Pretext (lineHeight × lineCount). */
  pretextHeight: number
  /** DOM reference height in pixels (NaN when DOM is unavailable). */
  domHeight: number
  /** Absolute pixel difference (|pretextHeight − domHeight|). */
  diffPx: number
  severity: DivergenceSeverity
  /** Execution time for this comparison in milliseconds. */
  executionTimeMs: number
}

/** Aggregate report produced after running a set of samples. */
export type ValidatorReport = {
  /** ISO timestamp of when the report was generated. */
  timestamp: string
  /** Total number of samples tested. */
  total: number
  /** Number of samples with severity === 'exact'. */
  passed: number
  /** Number of samples with severity !== 'exact'. */
  failed: number
  /** Overall pass rate 0–1. */
  passRate: number
  results: ComparisonResult[]
}
