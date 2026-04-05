// Unified ReportFormatter with chainable filtering/sorting API.
//
// Usage:
//   const fmt = new ReportFormatter(results)
//     .filterByLanguage('arabic')
//     .filterBySeverity('error')
//     .sortByDelta(false)
//
//   const html = fmt.toHTML()
//   const csv  = fmt.toCSV()
//   const md   = fmt.toMarkdown()

import type {
  LanguageCategory,
  LanguageSummary,
  Severity,
  ValidationResult,
  ValidationSummary,
} from './types.ts'
import { isPassing } from './comparator.ts'
import { generateHTMLReport } from './html-report-generator.ts'
import { exportCSV } from './csv-exporter.ts'
import { exportMarkdown } from './markdown-exporter.ts'
import { exportJSON } from './json-exporter.ts'

// ---------------------------------------------------------------------------
// Summary builder (shared by formatter and json-exporter)
// ---------------------------------------------------------------------------

/** Compute aggregate summary statistics from an array of results. */
export function buildSummary(results: ValidationResult[]): ValidationSummary {
  const counts = { exact: 0, close: 0, warning: 0, error: 0, critical: 0 }
  const byLanguage: Partial<Record<LanguageCategory, LanguageSummary>> = {}

  for (const r of results) {
    counts[r.severity]++

    const lang = r.language
    let entry = byLanguage[lang]
    if (entry === undefined) {
      entry = { language: lang, total: 0, passing: 0, passRate: 0, avgDelta: 0 }
      byLanguage[lang] = entry
    }
    entry.total++
    if (isPassing(r.severity)) entry.passing++
    entry.avgDelta += Math.abs(r.delta)
  }

  // Finalize per-language averages and pass rates
  for (const lang of Object.keys(byLanguage) as LanguageCategory[]) {
    const entry = byLanguage[lang]
    if (entry === undefined) continue
    entry.passRate = entry.total === 0 ? 0 : (entry.passing / entry.total) * 100
    entry.avgDelta = entry.total === 0 ? 0 : entry.avgDelta / entry.total
  }

  const total = results.length
  const passing = counts.exact + counts.close
  return {
    total,
    exact: counts.exact,
    close: counts.close,
    warning: counts.warning,
    error: counts.error,
    critical: counts.critical,
    passRate: total === 0 ? 0 : (passing / total) * 100,
    byLanguage,
  }
}

// ---------------------------------------------------------------------------
// ReportFormatter
// ---------------------------------------------------------------------------

export class ReportFormatter {
  private results: ValidationResult[]

  constructor(results: ValidationResult[]) {
    // Defensive copy so chaining doesn't mutate the source
    this.results = results.slice()
  }

  // ---- Filters -------------------------------------------------------------

  /** Keep only results for the given language category. */
  filterByLanguage(lang: LanguageCategory): ReportFormatter {
    return new ReportFormatter(this.results.filter((r) => r.language === lang))
  }

  /** Keep only results at or above the given severity level. */
  filterBySeverity(level: Severity): ReportFormatter {
    const order: Severity[] = ['exact', 'close', 'warning', 'error', 'critical']
    const minIdx = order.indexOf(level)
    return new ReportFormatter(
      this.results.filter((r) => order.indexOf(r.severity) >= minIdx),
    )
  }

  /**
   * Keep only results whose font string contains the given pattern
   * (case-insensitive substring match).
   */
  filterByFont(pattern: string): ReportFormatter {
    const lower = pattern.toLowerCase()
    return new ReportFormatter(this.results.filter((r) => r.font.toLowerCase().includes(lower)))
  }

  // ---- Sorting -------------------------------------------------------------

  /**
   * Sort by absolute delta value.
   *
   * @param ascending - `true` for smallest-first; defaults to `false` (largest-first).
   */
  sortByDelta(ascending = false): ReportFormatter {
    const sorted = this.results.slice().sort((a, b) => {
      const diff = Math.abs(a.delta) - Math.abs(b.delta)
      return ascending ? diff : -diff
    })
    return new ReportFormatter(sorted)
  }

  // ---- Statistics ----------------------------------------------------------

  /** Return aggregate summary statistics for the current filtered set. */
  summary(): ValidationSummary {
    return buildSummary(this.results)
  }

  // ---- Output formats ------------------------------------------------------

  /** Generate a self-contained HTML report. */
  toHTML(): string {
    return generateHTMLReport(this.results)
  }

  /** Generate an Excel-compatible UTF-8 BOM CSV string. */
  toCSV(): string {
    return exportCSV(this.results)
  }

  /** Generate GitHub-flavored Markdown. */
  toMarkdown(): string {
    return exportMarkdown(this.results)
  }

  /** Generate a complete JSON report document. */
  toJSON(): string {
    return exportJSON(this.results)
  }

  /**
   * Generate a plain-text console summary.
   *
   * @param useColor - Whether to include ANSI escape codes; defaults to `true`.
   */
  toConsole(useColor = true): string {
    const s = buildSummary(this.results)
    const reset = useColor ? '\x1b[0m' : ''
    const green = useColor ? '\x1b[32m' : ''
    const yellow = useColor ? '\x1b[33m' : ''
    const red = useColor ? '\x1b[31m' : ''

    const lines: string[] = [
      '',
      `${green}Measurement Validator — Summary${reset}`,
      `${'─'.repeat(40)}`,
      `  Total samples : ${s.total}`,
      `  Pass rate     : ${green}${s.passRate.toFixed(1)}%${reset}`,
      `  Exact         : ${green}${s.exact}${reset}`,
      `  Close         : ${green}${s.close}${reset}`,
      `  Warning       : ${yellow}${s.warning}${reset}`,
      `  Error         : ${red}${s.error}${reset}`,
      `  Critical      : ${red}${s.critical}${reset}`,
    ]

    if (Object.keys(s.byLanguage).length > 0) {
      lines.push(``, `  By language:`)
      for (const [lang, entry] of Object.entries(s.byLanguage)) {
        if (entry === undefined) continue
        const color = entry.passRate >= 99 ? green : entry.passRate >= 90 ? yellow : red
        lines.push(
          `    ${lang.padEnd(12)} ${color}${entry.passRate.toFixed(1)}%${reset}` +
            ` (${entry.passing}/${entry.total}, avg Δ ${entry.avgDelta.toFixed(2)}px)`,
        )
      }
    }

    lines.push('')
    return lines.join('\n')
  }

  /** Number of results in the current filtered set. */
  get count(): number {
    return this.results.length
  }

  /** Read-only view of the current filtered/sorted results. */
  get data(): readonly ValidationResult[] {
    return this.results
  }
}
