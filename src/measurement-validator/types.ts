// Core types for the measurement validator.
//
// The validator compares Pretext canvas-based line measurements against DOM
// measurements to surface divergences and classify their root causes.

// --- Inputs ---

export type MeasurementSample = {
  text: string // The text to measure
  font: string // CSS font string, e.g. '16px Arial'
  maxWidth: number // Container width in pixels
  lineHeight: number // Line height in pixels
  language?: string // BCP 47 language tag, e.g. 'en', 'ar', 'zh-Hans'
  wordBreak?: 'normal' | 'keep-all'
  whiteSpace?: 'normal' | 'pre-wrap'
}

// --- Line-level results ---

export type MeasurementLinePair = {
  lineIndex: number // 0-based line index
  pretextText: string // Text as returned by Pretext layoutWithLines
  pretextWidth: number // Width measured by Pretext
  domText: string // Text extracted from DOM Range
  domWidth: number // Width measured by DOM Range.getBoundingClientRect
  delta: number // pretextWidth - domWidth
  severity: LineSeverity
}

export type LineSeverity = 'pass' | 'minor' | 'major' | 'critical'

// --- Overall comparison result ---

export type MeasurementResult = {
  sample: MeasurementSample
  pretextLineCount: number
  domLineCount: number
  lineCountMatch: boolean
  lines: MeasurementLinePair[]
  overallSeverity: LineSeverity
  passRate: number // 0-1, fraction of lines within tolerance
  maxDelta: number // largest absolute delta across all lines
  durationMs: number // wall-clock time for the full comparison
}

// --- Divergence classifier output ---

export type DivergenceRootCause =
  | 'font_fallback'
  | 'bidi_shaping'
  | 'emoji_rendering'
  | 'browser_quirk'
  | 'variable_font'
  | 'unknown'

export type DivergenceAnalysis = {
  detected: boolean
  severity: 'minor' | 'major' | 'critical'
  rootCause?: DivergenceRootCause
  confidence: number // 0-1
  recommendation: string
  details: Record<string, unknown>
}

// --- Multi-language test suite ---

export type LanguageGroup =
  | 'ltr-simple' // English, Spanish, French
  | 'rtl' // Arabic, Hebrew, Urdu
  | 'cjk' // Chinese, Japanese, Korean
  | 'complex-script' // Thai, Myanmar, Khmer
  | 'mixed-bidi' // Mixed LTR + RTL

export type FixtureSample = MeasurementSample & {
  id: string
  description: string
  languageGroup: LanguageGroup
  expectedSeverity?: LineSeverity
}

export type LanguageGroupStats = {
  group: LanguageGroup
  total: number
  passed: number
  passRate: number
  averageDelta: number
  maxDelta: number
}

export type TestSuiteReport = {
  totalSamples: number
  totalPassed: number
  overallPassRate: number
  byLanguageGroup: LanguageGroupStats[]
  results: MeasurementResult[]
  divergences: DivergenceAnalysis[]
  generatedAt: string // ISO 8601
  durationMs: number
}

// --- Thresholds ---

export type ToleranceConfig = {
  passDelta: number // px — pass if |delta| <= this
  minorDelta: number // px — minor if passDelta < |delta| <= this
  majorDelta: number // px — major if minorDelta < |delta| <= this
  // critical: |delta| > majorDelta
}

export const DEFAULT_TOLERANCE: ToleranceConfig = {
  passDelta: 0.5,
  minorDelta: 1.0,
  majorDelta: 2.0,
}
