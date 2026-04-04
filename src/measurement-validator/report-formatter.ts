import type {
  MeasurementResult,
  MeasurementSeverity,
  ReportSummary,
  LanguageStats,
} from './types.js'
import { computeSummary, computeStatsByLanguage } from './stats.js'
import { exportToCSV, type CSVExportOptions } from './csv-exporter.js'
import {
  exportToMarkdown,
  type MarkdownExportOptions,
} from './markdown-exporter.js'
import {
  generateHTMLReport,
  type HTMLReportOptions,
} from './html-report-generator.js'
import { exportToJSON } from './json-exporter.js'

function severityIcon(severity: MeasurementSeverity): string {
  switch (severity) {
    case 'pass':
      return '✅'
    case 'warning':
      return '⚠️ '
    case 'error':
      return '❌'
    case 'critical':
      return '🔴'
  }
}

export class ReportFormatter {
  private _results: MeasurementResult[]

  constructor(results: MeasurementResult[]) {
    this._results = results
  }

  // ── Exporters ──────────────────────────────────────────────────────────────

  toHTML(options?: HTMLReportOptions): string {
    return generateHTMLReport(this._results, options)
  }

  toCSV(options?: CSVExportOptions): string {
    return exportToCSV(this._results, options)
  }

  toMarkdown(options?: MarkdownExportOptions): string {
    return exportToMarkdown(this._results, options)
  }

  toJSON(): string {
    return exportToJSON(this._results)
  }

  toConsole(): string {
    const summary = this.summary()
    const lines: string[] = []
    lines.push(`Total: ${summary.total}`)
    lines.push(
      `  ${severityIcon('pass')} ${summary.passed} passed (${(summary.passRate * 100).toFixed(1)}%)`,
    )
    lines.push(`  ${severityIcon('warning')} ${summary.warnings} warnings`)
    lines.push(`  ${severityIcon('error')} ${summary.errors} errors`)
    lines.push(`  ${severityIcon('critical')} ${summary.critical} critical`)
    for (const r of this._results) {
      if (r.overallSeverity !== 'pass') {
        lines.push(
          `  ${severityIcon(r.overallSeverity)} [${r.language}] ${r.sampleId}: ` +
            `pretext=${r.pretextWidth} dom=${r.domWidth} delta=${r.delta.toFixed(2)} (${r.rootCause})`,
        )
      }
    }
    return lines.join('\n')
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  filterByLanguage(language: string): ReportFormatter {
    return new ReportFormatter(
      this._results.filter(r => r.language === language),
    )
  }

  filterBySeverity(severity: MeasurementSeverity): ReportFormatter {
    return new ReportFormatter(
      this._results.filter(r => r.overallSeverity === severity),
    )
  }

  sortByDelta(ascending = true): ReportFormatter {
    const sorted = this._results
      .slice()
      .sort((a, b) =>
        ascending ? a.delta - b.delta : b.delta - a.delta,
      )
    return new ReportFormatter(sorted)
  }

  // ── Aggregates ─────────────────────────────────────────────────────────────

  summary(): ReportSummary {
    return computeSummary(this._results)
  }

  statisticsByLanguage(): Record<string, LanguageStats> {
    return computeStatsByLanguage(this._results)
  }
}
