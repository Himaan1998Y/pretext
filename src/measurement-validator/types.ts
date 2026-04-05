// Shared types for the measurement-validator module.
//
// The validator compares pretext canvas-based width predictions against
// actual DOM measurements, classifies divergences by severity and root
// cause, and produces structured reports for analysis.

// ---------------------------------------------------------------------------
// Core enumerations
// ---------------------------------------------------------------------------

export type Severity = 'exact' | 'close' | 'warning' | 'error' | 'critical'

export type LanguageCategory =
  | 'english'
  | 'arabic'
  | 'hebrew'
  | 'urdu'
  | 'chinese'
  | 'japanese'
  | 'korean'
  | 'thai'
  | 'myanmar'
  | 'khmer'
  | 'mixed'
  | 'unknown'

export type RootCause =
  | 'none'
  | 'font_fallback'
  | 'bidi_shaping'
  | 'emoji_correction'
  | 'browser_quirk'
  | 'unknown'

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

/** A pre-computed measurement pair to validate. */
export type MeasurementSample = {
  id: string
  text: string
  font: string
  fontSize: number
  containerWidth: number
  language?: LanguageCategory
}

/** Raw width pair before classification. */
export type MeasurementPair = {
  sample: MeasurementSample
  pretextWidth: number
  domWidth: number
}

/** Fully classified validation result. */
export type ValidationResult = {
  id: string
  text: string
  font: string
  fontSize: number
  containerWidth: number
  pretextWidth: number
  domWidth: number
  delta: number
  deltaPercent: number
  severity: Severity
  language: LanguageCategory
  rootCause: RootCause
  confidence: number
  timestamp: string
}

/** Per-language rollup used in summaries. */
export type LanguageSummary = {
  language: LanguageCategory
  total: number
  passing: number
  passRate: number
  avgDelta: number
}

/** Top-level summary statistics. */
export type ValidationSummary = {
  total: number
  exact: number
  close: number
  warning: number
  error: number
  critical: number
  passRate: number
  byLanguage: Partial<Record<LanguageCategory, LanguageSummary>>
}

/** Complete validation report document. */
export type ValidationReport = {
  metadata: {
    version: string
    generatedAt: string
    totalSamples: number
    tool: string
  }
  summary: ValidationSummary
  results: ValidationResult[]
}
