// Type definitions for the Measurement Validator module.
//
// The validator compares Pretext canvas-based measurements against actual
// browser DOM rendering (ground truth) to surface divergences and their
// likely root causes.

// --- Input types ---

export type WhiteSpaceMode = 'normal' | 'pre-wrap'
export type WordBreakMode = 'normal' | 'keep-all'
export type TextDirection = 'ltr' | 'rtl'

export type MeasurementSample = {
  /** The text to measure and compare. */
  text: string
  /** CSS font string, e.g. '16px Arial'. */
  font: string
  /** Container width in pixels. Defaults to 300. */
  maxWidth?: number
  /** Line height in pixels. Defaults to 1.2 * parsed font size. */
  lineHeight?: number
  /** CSS white-space mode. Defaults to 'normal'. */
  whiteSpace?: WhiteSpaceMode
  /** CSS word-break mode. Defaults to 'normal'. */
  wordBreak?: WordBreakMode
  /** Text direction. Defaults to 'ltr'. */
  direction?: TextDirection
  /** Optional label for reporting. */
  label?: string
}

// --- DOM measurement types ---

export type DOMLine = {
  /** Rendered line text extracted from DOM. */
  text: string
  /** Measured width of this line from the DOM (Range API). */
  width: number
}

export type DOMMeasurement = {
  lines: DOMLine[]
  /** Total rendered height of the container. */
  totalHeight: number
}

// --- Comparison types ---

export type Severity = 'exact' | 'minor' | 'major' | 'critical'

export type LineComparison = {
  /** 1-based line number. */
  lineNumber: number
  /** Line text (from Pretext; DOM text when Pretext line count differs). */
  text: string
  /** Width reported by Pretext. */
  pretextWidth: number
  /** Width measured from the DOM. */
  domWidth: number
  /** Absolute delta: |pretextWidth - domWidth|. */
  delta: number
  /** Relative error as a fraction of domWidth. */
  relativeError: number
  /** Per-line severity classification. */
  severity: Severity
}

export type DivergenceMetrics = {
  /** True when Pretext and DOM agree on the number of lines. */
  lineCountMatch: boolean
  /** Number of lines produced by Pretext. */
  pretextLineCount: number
  /** Number of lines measured from the DOM. */
  domLineCount: number
  /** Maximum absolute delta across all comparable lines. */
  maxLineDelta: number
  /** Average absolute delta across all comparable lines. */
  averageDelta: number
  /** Overall severity based on maxLineDelta. */
  severity: Severity
}

export type ComparisonResult = {
  /** Original sample that was compared. */
  sample: MeasurementSample
  /** Aggregate divergence metrics. */
  metrics: DivergenceMetrics
  /** Per-line comparison details. */
  lines: LineComparison[]
  /** Human-readable root cause if a known pattern was detected. */
  rootCause?: string | undefined
  /** ISO 8601 timestamp of when the comparison was performed. */
  timestamp: string
  /** navigator.userAgent at the time of comparison (empty in non-browser). */
  userAgent: string
}

// --- Report types ---

export type ReportSummary = {
  total: number
  exact: number
  minor: number
  major: number
  critical: number
  lineCountMismatches: number
  passRate: number
}

export type ValidationReport = {
  summary: ReportSummary
  results: ComparisonResult[]
  generatedAt: string
  userAgent: string
}

// --- Severity thresholds ---

/** < 0.1 px  → exact */
export const THRESHOLD_EXACT = 0.1
/** 0.1–0.5 px → minor */
export const THRESHOLD_MINOR = 0.5
/** 0.5–2 px  → major */
export const THRESHOLD_MAJOR = 2.0

export function classifySeverity(delta: number): Severity {
  if (delta < THRESHOLD_EXACT) return 'exact'
  if (delta < THRESHOLD_MINOR) return 'minor'
  if (delta < THRESHOLD_MAJOR) return 'major'
  return 'critical'
}
