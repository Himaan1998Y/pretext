import type {
  MeasurementResult,
  ReportSummary,
  LanguageStats,
} from './types.js'

export function computeSummary(results: MeasurementResult[]): ReportSummary {
  let passed = 0
  let warnings = 0
  let errors = 0
  let critical = 0
  for (const r of results) {
    switch (r.overallSeverity) {
      case 'pass':
        passed++
        break
      case 'warning':
        warnings++
        break
      case 'error':
        errors++
        break
      case 'critical':
        critical++
        break
    }
  }
  const total = results.length
  return {
    total,
    passed,
    warnings,
    errors,
    critical,
    passRate: total === 0 ? 1 : passed / total,
  }
}

export function computeStatsByLanguage(
  results: MeasurementResult[],
): Record<string, LanguageStats> {
  const map: Record<string, LanguageStats> = {}
  for (const r of results) {
    const entry = (map[r.language] ??= {
      language: r.language,
      total: 0,
      passed: 0,
      warnings: 0,
      errors: 0,
      critical: 0,
    })
    entry.total++
    switch (r.overallSeverity) {
      case 'pass':
        entry.passed++
        break
      case 'warning':
        entry.warnings++
        break
      case 'error':
        entry.errors++
        break
      case 'critical':
        entry.critical++
        break
    }
  }
  return map
}
