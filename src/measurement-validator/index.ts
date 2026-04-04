/**
 * Measurement Validator Module
 */

export { MeasurementComparator } from './comparator.js'
export type { PretextLayoutResult } from './comparator.js'
export { measureDOMText, getComputedLineHeight, measureLineWidths } from './dom-adapter.js'
export type { DOMTextMetrics } from './dom-adapter.js'
export { classifyDivergence, detectFontFallback, detectBidi, detectEmoji, detectBrowserQuirk } from './classifier.js'
export {
  generateJSONReport,
  generateConsoleSummary,
  generateDetailedReport,
  generateLanguageBreakdown,
} from './report-generator.js'
export { TestSuite } from './test-suite.js'
export type { CorpusSample, TestSuiteSummary } from './test-suite.js'

export type {
  MeasurementSample,
  MeasurementResult,
  LineComparison,
  DivergenceAnalysis,
} from './types.js'

export { SEVERITY_THRESHOLDS } from './types.js'
