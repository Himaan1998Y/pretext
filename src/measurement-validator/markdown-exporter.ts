import type { MeasurementResult, LanguageStats } from './types.js'
import { computeSummary, computeStatsByLanguage } from './stats.js'

export interface MarkdownExportOptions {
  includeDetails?: boolean
  groupByLanguage?: boolean
}

function severityIcon(severity: MeasurementResult['overallSeverity']): string {
  switch (severity) {
    case 'pass':
      return '✅'
    case 'warning':
      return '⚠️'
    case 'error':
      return '❌'
    case 'critical':
      return '🔴'
  }
}

function pct(n: number, total: number): string {
  if (total === 0) return '0.0%'
  return ((n / total) * 100).toFixed(1) + '%'
}

export function exportToMarkdown(
  results: MeasurementResult[],
  options: MarkdownExportOptions = {},
): string {
  const groupByLanguage = options.groupByLanguage ?? true
  const summary = computeSummary(results)
  const now = new Date().toUTCString()

  const lines: string[] = []

  lines.push('# Measurement Validator Report')
  lines.push('')
  lines.push(`**Generated:** ${now}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(
    `- ✅ **${summary.passed.toLocaleString()} passed** (${pct(summary.passed, summary.total)})`,
  )
  lines.push(
    `- ⚠️ **${summary.warnings.toLocaleString()} warnings** (${pct(summary.warnings, summary.total)})`,
  )
  lines.push(
    `- ❌ **${summary.errors.toLocaleString()} errors** (${pct(summary.errors, summary.total)})`,
  )
  lines.push(
    `- 🔴 **${summary.critical.toLocaleString()} critical** (${pct(summary.critical, summary.total)})`,
  )
  lines.push('')

  if (groupByLanguage) {
    const byLanguage = computeStatsByLanguage(results)
    const grouped: Record<string, MeasurementResult[]> = {}
    for (const r of results) {
      ;(grouped[r.language] ??= []).push(r)
    }

    lines.push('## Results by Language')
    lines.push('')

    for (const [lang, rows] of Object.entries(grouped)) {
      const stats: LanguageStats = byLanguage[lang] ?? {
        language: lang,
        total: rows.length,
        passed: 0,
        warnings: 0,
        errors: 0,
        critical: 0,
      }
      lines.push(`### ${lang} (${stats.total} samples)`)
      lines.push('')
      lines.push('| Text | Font | Pretext | DOM | Delta | Severity |')
      lines.push('|------|------|---------|-----|-------|----------|')
      for (const r of rows) {
        const text = r.text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
        lines.push(
          `| ${text} | ${r.font} | ${r.pretextWidth}px | ${r.domWidth}px | ${r.delta.toFixed(2)}px | ${severityIcon(r.overallSeverity)} |`,
        )
      }
      lines.push('')
    }
  } else {
    lines.push('## Results')
    lines.push('')
    lines.push('| Text | Font | Pretext | DOM | Delta | Severity |')
    lines.push('|------|------|---------|-----|-------|----------|')
    for (const r of results) {
      const text = r.text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
      lines.push(
        `| ${text} | ${r.font} | ${r.pretextWidth}px | ${r.domWidth}px | ${r.delta.toFixed(2)}px | ${severityIcon(r.overallSeverity)} |`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}
