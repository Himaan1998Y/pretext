// Public API for the measurement validator.
//
// Phase 1: core comparison (comparator, DOM adapter, report generator, types)
// Phase 2: divergence classifier and multi-language test suite

export type {
  DivergenceAnalysis,
  DivergenceRootCause,
  FixtureSample,
  LanguageGroup,
  LanguageGroupStats,
  LineSeverity,
  MeasurementLinePair,
  MeasurementResult,
  MeasurementSample,
  TestSuiteReport,
  ToleranceConfig,
} from './types.js'

export { DEFAULT_TOLERANCE } from './types.js'

export type { DOMAdapter, DOMLineMetrics } from './dom-adapter.js'
export { createDOMAdapter, measureDOMLines } from './dom-adapter.js'

export type { Comparator, ComparatorOptions } from './comparator.js'
export { compareMeasurements, createComparator } from './comparator.js'

export {
  buildGroupStats,
  formatDivergenceConsole,
  formatResultConsole,
  formatResultJSON,
  formatSuiteConsole,
  formatSuiteJSON,
} from './report-generator.js'

// Phase 2: classifier
export {
  classifyAll,
  classifyDivergence,
  classifyDivergenceSync,
} from './classifier.js'

// Phase 2: test suite
export type { FixtureSet, TestSuiteOptions } from './test-suite.js'
export {
  filterByGroup,
  groupSamplesByLanguage,
  runTestSuite,
  validateFixtureSamples,
} from './test-suite.js'
