// Shared types for the measurement-validator Phase 4 components.

export type BrowserName = 'chrome' | 'safari' | 'firefox'

export type AccuracySnapshot = {
  status: string
  total: number
  matchCount: number
  mismatchCount: number
}

export type BenchmarkEntry = {
  label: string
  ms: number
  desc: string
}

export type BenchmarkSnapshot = {
  status: string
  results?: BenchmarkEntry[]
  richResults?: BenchmarkEntry[]
  richInlineResults?: BenchmarkEntry[]
  richPreWrapResults?: BenchmarkEntry[]
  richLongResults?: BenchmarkEntry[]
}

export type PerformanceMetrics = {
  label: string
  baselineMs: number
  currentMs: number
  deltaMs: number
  deltaPct: number
  trend: 'improving' | 'stable' | 'degrading'
}

export type PerformanceReport = {
  generatedAt: string
  browser: BrowserName
  metrics: PerformanceMetrics[]
  regressionCount: number
}

export type RegressionSeverity = 'ok' | 'warning' | 'critical'

export type AccuracyRegression = {
  browser: BrowserName
  baselineMatchCount: number
  currentMatchCount: number
  baselineTotal: number
  currentTotal: number
  delta: number
  severity: RegressionSeverity
}

export type PerformanceRegression = {
  label: string
  browser: BrowserName
  baselineMs: number
  currentMs: number
  deltaPct: number
  severity: RegressionSeverity
}

export type RegressionReport = {
  generatedAt: string
  accuracyRegressions: AccuracyRegression[]
  performanceRegressions: PerformanceRegression[]
  hasBlocker: boolean
}

export type ValidationRunRecord = {
  id: string
  runAt: string
  browser: BrowserName
  accuracyTotal: number
  accuracyMatches: number
  benchmarkJson: string
  regressionJson: string
  tags: string
}
