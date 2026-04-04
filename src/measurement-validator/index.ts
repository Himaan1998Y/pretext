// Public API for the measurement-validator module.
//
// Usage (in a browser or via the CLI):
//
//   import { compare, buildReport, toCSV } from '@chenglou/pretext/measurement-validator'
//
//   const results = fixtures.en.map(compare)
//   const report  = buildReport(results)
//   console.log(toCSV(report))

export type {
  ComparisonResult,
  DivergenceSeverity,
  MeasurementSample,
  ValidatorReport,
} from './types.js'

export { compare } from './comparator.js'

export { fixtures, englishFixtures } from './test-suite.js'

export {
  buildReport,
  printConsoleReport,
  toCSV,
  toHTML,
  toJSON,
  toMarkdown,
} from './report-generator.js'
