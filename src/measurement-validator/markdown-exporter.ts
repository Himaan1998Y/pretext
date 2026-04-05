// Markdown exporter for measurement results.
// Produces GitHub-flavored Markdown from MeasurementResult arrays.

import type { MeasurementResult, ValidationSummary } from './types.js'
import { buildLanguageBreakdown } from './classifier.js'

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

export function exportToMarkdown(
  results: MeasurementResult[],
  summary?: ValidationSummary
): string {
  const lines: string[] = []
  const ts = new Date().toUTCString()

  lines.push('# Measurement Validation Report')
  lines.push('')
  lines.push(`Generated: ${ts}`)
  lines.push('')

  // Summary section
  const s = summary ?? {
    total: results.length,
    passed: results.filter((r) => r.severity === 'pass').length,
    warnings: results.filter((r) => r.severity === 'warning').length,
    criticals: results.filter((r) => r.severity === 'critical').length,
    passRate:
      results.length > 0
        ? results.filter((r) => r.severity === 'pass').length / results.length
        : 1,
    byLanguage: buildLanguageBreakdown(results),
    durationMs: 0,
    timestamp: Date.now(),
  }

  lines.push('## Summary')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('|--------|-------|')
  lines.push(`| Total samples | ${s.total} |`)
  lines.push(`| Passed | ${s.passed} ✅ |`)
  lines.push(`| Warnings | ${s.warnings} ⚠️ |`)
  lines.push(`| Criticals | ${s.criticals} ❌ |`)
  lines.push(`| Pass rate | ${pct(s.passRate)} |`)
  if (s.durationMs > 0) {
    lines.push(`| Duration | ${s.durationMs.toFixed(0)}ms |`)
  }
  lines.push('')

  // Per-language breakdown
  if (s.byLanguage.length > 0) {
    lines.push('## By Language')
    lines.push('')
    lines.push(
      '| Language | Total | Pass | Warn | Critical | Pass Rate | Avg Divergence |'
    )
    lines.push(
      '|----------|-------|------|------|----------|-----------|----------------|'
    )
    for (const b of s.byLanguage) {
      lines.push(
        `| ${b.language} | ${b.total} | ${b.passed} | ${b.warnings} | ${b.criticals} | ${pct(b.passRate)} | ${b.avgDivergencePixels.toFixed(2)}px |`
      )
    }
    lines.push('')
  }

  // Diverged results
  const diverged = results.filter((r) => r.diverged)
  if (diverged.length > 0) {
    lines.push('## Divergences')
    lines.push('')
    lines.push('| ID | Language | Severity | Reason | Divergence | Text |')
    lines.push('|----|----------|----------|--------|------------|------|')
    for (const r of diverged) {
      const badge =
        r.severity === 'critical' ? '❌' : r.severity === 'warning' ? '⚠️' : '✅'
      const preview =
        r.text.length > 40 ? r.text.slice(0, 40) + '…' : r.text
      lines.push(
        `| ${r.id} | ${r.language} | ${badge} ${r.severity} | ${r.reason} | ${r.divergencePixels.toFixed(2)}px | ${preview} |`
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}
