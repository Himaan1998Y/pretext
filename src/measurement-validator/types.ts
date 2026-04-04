/**
 * Measurement Validator Types
 */

export interface MeasurementSample {
  text: string
  font: string
  maxWidth: number
  lineHeight?: number
  whiteSpace?: 'normal' | 'pre-wrap'
}

export interface LineComparison {
  index: number
  text: string
  pretextWidth: number
  domWidth: number
  delta: number
  percentError: number
  severity: 'exact' | 'minor' | 'major' | 'critical'
}

export interface MeasurementResult {
  sample: MeasurementSample
  lines: LineComparison[]
  totalLines: number
  exactMatches: number
  minorDelta: number
  majorDelta: number
  criticalDelta: number
  overallSeverity: 'pass' | 'warning' | 'error' | 'critical'
  timestamp: string
  executionTimeMs: number
}

export interface DivergenceAnalysis {
  detected: boolean
  severity: 'minor' | 'major' | 'critical'
  rootCause?: 'font_fallback' | 'bidi_shaping' | 'emoji_rendering' | 'browser_quirk' | 'variable_font' | 'unknown'
  confidence: number
  recommendation: string
  details: Record<string, unknown>
}

export const SEVERITY_THRESHOLDS = {
  exact: 0.1,
  minor: 0.5,
  major: 2.0,
  critical: Infinity,
} as const
