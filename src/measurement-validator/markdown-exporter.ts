// GitHub-flavored Markdown exporter for validation results.
//
// Produces a structured Markdown document with:
//   - Top-level summary statistics with emoji indicators
//   - Per-language sections, each with a results table
//   - Copy-paste ready for GitHub issues, PR comments, and documentation

import type { LanguageCategory, ValidationResult } from './types.ts'
import { buildSummary } from './report-formatter.ts'

const SEVERITY_EMOJI: Record<string, string> = {
  exact: '✅',
  close: '✅',
  warning: '⚠️',
  error: '❌',
  critical: '🔴',
}

const LANGUAGE_LABELS: Record<string, string> = {
  english: 'English',
  arabic: 'Arabic',
  hebrew: 'Hebrew',
  urdu: 'Urdu',
  chinese: 'Chinese',
  japanese: 'Japanese',
  korean: 'Korean',
  thai: 'Thai',
  myanmar: 'Myanmar',
  khmer: 'Khmer',
  mixed: 'Mixed Script',
  unknown: 'Unknown',
}

/** Escape Markdown pipe characters inside table cells. */
function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, ' ')
}

/** Format a number with up to 2 decimal places, stripping trailing zeros. */
function fmt2(n: number): string {
  return parseFloat(n.toFixed(2)).toString()
}

/**
 * Generate GitHub-flavored Markdown from validation results.
 *
 * Results are grouped into per-language sections. Within each section the
 * table rows are sorted by absolute delta descending so the worst cases
 * appear first.
 */
export function exportMarkdown(results: ValidationResult[]): string {
  const s = buildSummary(results)
  const generatedAt = new Date().toISOString()
  const lines: string[] = []

  // ---- Header ---------------------------------------------------------------
  lines.push('# Measurement Validator Report', '')
  lines.push(`_Generated: ${generatedAt}_`, '')

  // ---- Summary section ------------------------------------------------------
  lines.push('## Summary', '')
  lines.push(
    `| | Count | Rate |`,
    `|---|---:|---:|`,
    `| ✅ Exact | ${s.exact} | ${s.exact === 0 ? '0.0' : fmt2((s.exact / s.total) * 100)}% |`,
    `| ✅ Close | ${s.close} | ${s.close === 0 ? '0.0' : fmt2((s.close / s.total) * 100)}% |`,
    `| ⚠️ Warning | ${s.warning} | ${s.warning === 0 ? '0.0' : fmt2((s.warning / s.total) * 100)}% |`,
    `| ❌ Error | ${s.error} | ${s.error === 0 ? '0.0' : fmt2((s.error / s.total) * 100)}% |`,
    `| 🔴 Critical | ${s.critical} | ${s.critical === 0 ? '0.0' : fmt2((s.critical / s.total) * 100)}% |`,
    `| **Total** | **${s.total}** | **Pass rate: ${fmt2(s.passRate)}%** |`,
    '',
  )

  // ---- Per-language sections ------------------------------------------------
  // Group by language
  const groups = new Map<LanguageCategory, ValidationResult[]>()
  for (const r of results) {
    let group = groups.get(r.language)
    if (group === undefined) {
      group = []
      groups.set(r.language, group)
    }
    group.push(r)
  }

  // Sort languages by total desc
  const sortedLanguages = [...groups.keys()].sort((a, b) => {
    const ga = groups.get(a) ?? []
    const gb = groups.get(b) ?? []
    return gb.length - ga.length
  })

  lines.push('## Results by Language', '')

  for (const lang of sortedLanguages) {
    const group = groups.get(lang) ?? []
    const label = LANGUAGE_LABELS[lang] ?? lang
    const langSummary = s.byLanguage[lang]

    lines.push(`### ${label} (${group.length} samples)`, '')

    if (langSummary !== undefined) {
      lines.push(
        `Pass rate: **${fmt2(langSummary.passRate)}%** — ` +
          `avg delta: **${fmt2(langSummary.avgDelta)}px**`,
        '',
      )
    }

    lines.push(
      '| # | Text | Font | Pretext (px) | DOM (px) | Δ (px) | Status |',
      '|---|------|------|---:|---:|---:|:---:|',
    )

    // Worst first
    const sorted = group.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i]
      if (r === undefined) continue
      const emoji = SEVERITY_EMOJI[r.severity] ?? '?'
      lines.push(
        `| ${i + 1} ` +
          `| ${mdCell(r.text.slice(0, 40))} ` +
          `| ${mdCell(r.font)} ` +
          `| ${fmt2(r.pretextWidth)} ` +
          `| ${fmt2(r.domWidth)} ` +
          `| ${fmt2(r.delta)} ` +
          `| ${emoji} |`,
      )
    }

    lines.push('')
  }

  return lines.join('\n')
}
