// Measurement Validator: detect and quantify divergence between Pretext's
// canvas-based measurements and browser DOM rendering.
//
// Usage:
//   import { MeasurementComparator } from '@chenglou/pretext/measurement-validator'
//
//   const comparator = new MeasurementComparator()
//   const result = await comparator.compare({
//     text: 'Hello world',
//     font: '16px Inter',
//     maxWidth: 300,
//     lineHeight: 20,
//   })
//
// Components:
//   MeasurementComparator  — Core engine: Pretext vs DOM comparison
//   DivergenceClassifier   — Root cause detection (font fallback, bidi, emoji, etc.)
//   ReportGenerator        — Human-readable output (text, JSON, HTML)
//   TestSuiteRunner        — Batch validation across a corpus of samples

import { layoutWithLines, prepareWithSegments } from './layout.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Platform/browser context for a measurement sample. */
export type MeasurementPlatform = 'chrome' | 'firefox' | 'safari' | 'node' | 'unknown'

/** Input descriptor for a single measurement comparison. */
export interface MeasurementSample {
  text: string
  font: string
  maxWidth?: number
  lineHeight?: number
  /** @default 'normal' */
  whiteSpace?: 'normal' | 'pre-wrap'
  locale?: string
  /** Hint for reporting — does not influence layout. */
  platform?: MeasurementPlatform
}

/** Per-line breakdown between Pretext and DOM measurements. */
export interface LineDivergence {
  index: number
  pretextWidth: number
  domWidth: number
  delta: number
  text: string
  severity: DivergenceSeverity
}

/** Classification of a single measurement divergence. */
export type DivergenceSeverity = 'exact' | 'minor' | 'major' | 'critical'

/** Overall pass/fail level of a comparison result. */
export type ResultSeverity = 'pass' | 'warning' | 'error' | 'critical'

/** Detected root cause for a divergence. */
export type DivergenceCause =
  | 'font-fallback'
  | 'bidi'
  | 'emoji'
  | 'kerning'
  | 'variable-font'
  | 'pre-wrap'
  | 'unknown'

/** Full comparison result for a single MeasurementSample. */
export interface MeasurementResult {
  sample: MeasurementSample

  // Line counts
  pretextLineCount: number
  domLineCount: number
  lineMismatch: boolean

  // Total block height
  pretextHeight: number
  domHeight: number
  heightDelta: number
  heightPercentError: number

  // Per-line breakdown
  lines: LineDivergence[]

  // Classification
  severity: ResultSeverity
  causes: DivergenceCause[]

  // Metadata
  timestamp: string
  platform: MeasurementPlatform
  viewport: { width: number; height: number }
}

/** Aggregated summary over a batch of samples. */
export interface SuiteReport {
  total: number
  passed: number
  warnings: number
  errors: number
  criticals: number
  passRate: number
  results: MeasurementResult[]
  timestamp: string
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const MINOR_THRESHOLD = 0.5
const MAJOR_THRESHOLD = 2.0

/** Classify a pixel delta into a severity bucket. */
export function classifyDelta(delta: number): DivergenceSeverity {
  const abs = Math.abs(delta)
  if (abs === 0) return 'exact'
  if (abs < MINOR_THRESHOLD) return 'minor'
  if (abs < MAJOR_THRESHOLD) return 'major'
  return 'critical'
}

/** Map the worst line severity to a result-level severity. */
export function lineSeverityToResult(lineSeverity: DivergenceSeverity): ResultSeverity {
  switch (lineSeverity) {
    case 'exact':
    case 'minor':
      return 'pass'
    case 'major':
      return 'warning'
    case 'critical':
      return 'error'
  }
}

/** Derive overall result severity from per-line divergences and line-count mismatch. */
export function deriveResultSeverity(lines: LineDivergence[], lineMismatch: boolean): ResultSeverity {
  if (lineMismatch) return 'critical'
  let worst: DivergenceSeverity = 'exact'
  for (const line of lines) {
    if (line.severity === 'critical') return 'critical'
    if (line.severity === 'major') worst = 'major'
    else if (line.severity === 'minor' && worst === 'exact') worst = 'minor'
  }
  return lineSeverityToResult(worst)
}

// ---------------------------------------------------------------------------
// DivergenceClassifier
// ---------------------------------------------------------------------------

/** Detect root causes for a measurement divergence. */
export class DivergenceClassifier {
  private static rtlRe = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u07C0-\u07FF\uFB50-\uFDFF\uFE70-\uFEFF]/
  private static emojiRe = /\p{Emoji_Presentation}/u
  private static variationSelectorRe = /[\uFE0F\uFE0E]/

  /**
   * Classify the likely root causes from the sample and its result.
   * Can be called before DOM comparison is available by passing `lines = []`.
   */
  classify(sample: MeasurementSample, lines: LineDivergence[]): DivergenceCause[] {
    const causes: DivergenceCause[] = []

    // Bidi: RTL characters in text
    if (DivergenceClassifier.rtlRe.test(sample.text)) {
      causes.push('bidi')
    }

    // Emoji: emoji codepoints
    if (DivergenceClassifier.emojiRe.test(sample.text) || DivergenceClassifier.variationSelectorRe.test(sample.text)) {
      causes.push('emoji')
    }

    // Pre-wrap mode
    if (sample.whiteSpace === 'pre-wrap') {
      causes.push('pre-wrap')
    }

    // Variable font: font-variation-settings hint
    if (sample.font.includes('wght') || sample.font.includes('ital') || sample.font.includes('wdth')) {
      causes.push('variable-font')
    }

    // Font fallback: if we detect divergence but no more specific cause
    if (lines.some(l => l.severity === 'critical' || l.severity === 'major') && causes.length === 0) {
      causes.push('font-fallback')
    }

    // If still nothing but there are divergences, mark unknown
    if (causes.length === 0 && lines.some(l => l.severity !== 'exact')) {
      causes.push('unknown')
    }

    return causes
  }
}

// ---------------------------------------------------------------------------
// MeasurementComparator
// ---------------------------------------------------------------------------

/** Options for MeasurementComparator. */
export interface ComparatorOptions {
  /** Override the default DivergenceClassifier. */
  classifier?: DivergenceClassifier
  /** If true, skip DOM measurement and use Pretext-only data for testing. */
  pretextOnly?: boolean
}

/**
 * Core comparison engine. Compares Pretext's canvas-based measurements against
 * browser DOM measurements.
 *
 * In browser environments, call `compare()` to get DOM-vs-Pretext divergence.
 * In Node/test environments, set `pretextOnly: true` to get Pretext-only data.
 */
export class MeasurementComparator {
  private readonly classifier: DivergenceClassifier
  private readonly pretextOnly: boolean

  constructor(options: ComparatorOptions = {}) {
    this.classifier = options.classifier ?? new DivergenceClassifier()
    this.pretextOnly = options.pretextOnly ?? false
  }

  /**
   * Run a single comparison. In browser contexts this also reads DOM geometry;
   * in `pretextOnly` mode the DOM fields mirror Pretext values (delta = 0).
   */
  compare(sample: MeasurementSample): MeasurementResult {
    const {
      text,
      font,
      maxWidth = 300,
      lineHeight = 20,
      whiteSpace = 'normal',
      platform = detectPlatform(),
    } = sample

    // --- Pretext measurement ---
    const options = whiteSpace === 'pre-wrap' ? { whiteSpace: 'pre-wrap' as const } : undefined
    const prepared = prepareWithSegments(text, font, options)
    const layoutResult = layoutWithLines(prepared, maxWidth, lineHeight)
    const pretextLines = layoutResult.lines
    const pretextLineCount = layoutResult.lineCount
    const pretextHeight = layoutResult.height

    // --- DOM measurement (or stub in pretextOnly mode) ---
    let domLines: { text: string; width: number }[]
    let domHeight: number

    if (!this.pretextOnly && typeof document !== 'undefined') {
      const domResult = measureDOM(text, font, maxWidth, lineHeight, whiteSpace)
      domLines = domResult.lines
      domHeight = domResult.height
    } else {
      // Stub: DOM = Pretext (delta = 0). Useful in Node / unit-test environments.
      domLines = pretextLines.map(l => ({ text: l.text, width: l.width }))
      domHeight = pretextHeight
    }

    const domLineCount = domLines.length

    // --- Per-line divergence ---
    const lineCount = Math.max(pretextLineCount, domLineCount)
    const lines: LineDivergence[] = []

    for (let i = 0; i < lineCount; i++) {
      const pt = pretextLines[i]
      const dm = domLines[i]

      const pretextWidth = pt?.width ?? 0
      const domWidth = dm?.width ?? 0
      const delta = domWidth - pretextWidth
      const severity = classifyDelta(delta)

      lines.push({
        index: i,
        pretextWidth,
        domWidth,
        delta,
        text: pt?.text ?? dm?.text ?? '',
        severity,
      })
    }

    // --- Heights ---
    const heightDelta = domHeight - pretextHeight
    const heightPercentError = pretextHeight === 0 ? 0 : (Math.abs(heightDelta) / pretextHeight) * 100

    // --- Classification ---
    const lineMismatch = pretextLineCount !== domLineCount
    const severity = deriveResultSeverity(lines, lineMismatch)
    const causes = this.classifier.classify(sample, lines)

    const viewport =
      typeof window !== 'undefined'
        ? { width: window.innerWidth, height: window.innerHeight }
        : { width: 0, height: 0 }

    return {
      sample,
      pretextLineCount,
      domLineCount,
      lineMismatch,
      pretextHeight,
      domHeight,
      heightDelta,
      heightPercentError,
      lines,
      severity,
      causes,
      timestamp: new Date().toISOString(),
      platform,
      viewport,
    }
  }

  /** Convenience: compare multiple samples and return an array of results. */
  compareAll(samples: MeasurementSample[]): MeasurementResult[] {
    return samples.map(s => this.compare(s))
  }
}

// ---------------------------------------------------------------------------
// DOM measurement helper (browser-only)
// ---------------------------------------------------------------------------

interface DOMLines {
  lines: { text: string; width: number }[]
  height: number
}

/**
 * Measure text using real DOM layout. Returns per-line widths and total height.
 * Only works in browser environments with a live `document`.
 */
function measureDOM(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
  whiteSpace: 'normal' | 'pre-wrap',
): DOMLines {
  const container = document.createElement('div')
  Object.assign(container.style, {
    position: 'absolute',
    top: '-9999px',
    left: '-9999px',
    width: `${maxWidth}px`,
    font,
    lineHeight: `${lineHeight}px`,
    whiteSpace: whiteSpace === 'pre-wrap' ? 'pre-wrap' : 'normal',
    wordBreak: 'normal',
    overflowWrap: 'break-word',
    visibility: 'hidden',
    pointerEvents: 'none',
  })
  container.textContent = text
  document.body.appendChild(container)

  const domHeight = container.offsetHeight
  const domLineCount = Math.round(domHeight / lineHeight) || 1

  // Extract per-line widths using Range
  const textNode = container.firstChild
  const lines: { text: string; width: number }[] = []

  if (textNode != null) {
    const range = document.createRange()
    range.selectNodeContents(textNode)
    const clientRects = range.getClientRects()

    for (let i = 0; i < clientRects.length; i++) {
      const rect = clientRects[i]!
      lines.push({ text: '', width: rect.width })
    }
  }

  // Fallback: equal-width placeholder lines if Range gave no rects
  if (lines.length === 0) {
    const avgWidth = container.offsetWidth
    for (let i = 0; i < domLineCount; i++) {
      lines.push({ text: '', width: avgWidth })
    }
  }

  document.body.removeChild(container)
  return { lines, height: domHeight }
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function detectPlatform(): MeasurementPlatform {
  if (typeof navigator === 'undefined') return 'node'
  const ua = navigator.userAgent
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) return 'chrome'
  if (/Firefox/.test(ua)) return 'firefox'
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'safari'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// TestSuiteRunner
// ---------------------------------------------------------------------------

/** Options for a TestSuiteRunner. */
export interface TestSuiteOptions {
  /** Abort if any sample produces a result at or above this severity. */
  failOn?: ResultSeverity
  /** Comparator to use (defaults to a new pretextOnly MeasurementComparator). */
  comparator?: MeasurementComparator
}

/**
 * Batch validator: run a corpus of samples through the comparator and
 * produce an aggregated SuiteReport.
 */
export class TestSuiteRunner {
  private readonly comparator: MeasurementComparator
  private readonly failOn: ResultSeverity | undefined

  constructor(options: TestSuiteOptions = {}) {
    this.comparator = options.comparator ?? new MeasurementComparator()
    this.failOn = options.failOn
  }

  /** Run all samples. Returns a SuiteReport. */
  run(samples: MeasurementSample[]): SuiteReport {
    const results = this.comparator.compareAll(samples)

    let passed = 0
    let warnings = 0
    let errors = 0
    let criticals = 0

    for (const r of results) {
      switch (r.severity) {
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
          criticals++
          break
      }
    }

    return {
      total: results.length,
      passed,
      warnings,
      errors,
      criticals,
      passRate: results.length === 0 ? 1 : passed / results.length,
      results,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * Run samples and throw if the configured `failOn` threshold is breached.
   * Returns the report on success.
   */
  runOrThrow(samples: MeasurementSample[]): SuiteReport {
    const report = this.run(samples)
    if (this.failOn != null) {
      const severityOrder: ResultSeverity[] = ['pass', 'warning', 'error', 'critical']
      const threshold = severityOrder.indexOf(this.failOn)
      for (const r of report.results) {
        if (severityOrder.indexOf(r.severity) >= threshold) {
          throw new Error(
            `Measurement validation failed: sample "${r.sample.text.slice(0, 40)}" ` +
              `produced ${r.severity} (threshold: ${this.failOn})`,
          )
        }
      }
    }
    return report
  }
}

// ---------------------------------------------------------------------------
// ReportGenerator
// ---------------------------------------------------------------------------

/** Output format for a report. */
export type ReportFormat = 'text' | 'json' | 'html'

/** Options for ReportGenerator. */
export interface ReportOptions {
  /** Whether to include passing results in the report. @default false */
  includePassing?: boolean
}

/** Generate human-readable reports from a SuiteReport or single MeasurementResult. */
export class ReportGenerator {
  private readonly includePassing: boolean

  constructor(options: ReportOptions = {}) {
    this.includePassing = options.includePassing ?? false
  }

  /** Render in the requested format. */
  render(report: SuiteReport, format: ReportFormat = 'text'): string {
    switch (format) {
      case 'json':
        return this.toJSON(report)
      case 'html':
        return this.toHTML(report)
      default:
        return this.toText(report)
    }
  }

  /** Render a single result as text. */
  renderResult(result: MeasurementResult, format: ReportFormat = 'text'): string {
    const report: SuiteReport = {
      total: 1,
      passed: result.severity === 'pass' ? 1 : 0,
      warnings: result.severity === 'warning' ? 1 : 0,
      errors: result.severity === 'error' ? 1 : 0,
      criticals: result.severity === 'critical' ? 1 : 0,
      passRate: result.severity === 'pass' ? 1 : 0,
      results: [result],
      timestamp: result.timestamp,
    }
    return this.render(report, format)
  }

  private toText(report: SuiteReport): string {
    const pct = (report.passRate * 100).toFixed(1)
    const lines: string[] = [
      `Measurement Validator Report — ${report.timestamp}`,
      `${report.passed}/${report.total} passed (${pct}%)  ` +
        `${report.warnings} warnings  ${report.errors} errors  ${report.criticals} critical`,
      '',
    ]

    for (const r of report.results) {
      if (!this.includePassing && r.severity === 'pass') continue
      const icon = severityIcon(r.severity)
      const text = r.sample.text.slice(0, 60)
      lines.push(
        `${icon} [${r.severity.toUpperCase()}] "${text}"`,
        `   font: ${r.sample.font}  width: ${r.sample.maxWidth ?? 300}px  lines: ${r.pretextLineCount}→${r.domLineCount}`,
        `   height: Pretext ${r.pretextHeight}px  DOM ${r.domHeight}px  Δ${r.heightDelta >= 0 ? '+' : ''}${r.heightDelta.toFixed(1)}px (${r.heightPercentError.toFixed(1)}%)`,
      )
      if (r.causes.length > 0) {
        lines.push(`   causes: ${r.causes.join(', ')}`)
      }
      for (const line of r.lines) {
        if (!this.includePassing && line.severity === 'exact') continue
        lines.push(
          `   line ${line.index}: Pretext ${line.pretextWidth.toFixed(1)}px  DOM ${line.domWidth.toFixed(1)}px  Δ${line.delta >= 0 ? '+' : ''}${line.delta.toFixed(1)}px [${line.severity}]`,
        )
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  private toJSON(report: SuiteReport): string {
    return JSON.stringify(report, null, 2)
  }

  private toHTML(report: SuiteReport): string {
    const pct = (report.passRate * 100).toFixed(1)
    const rows = report.results
      .filter(r => this.includePassing || r.severity !== 'pass')
      .map(r => {
        const icon = severityIcon(r.severity)
        const text = escapeHTML(r.sample.text.slice(0, 80))
        return `    <tr class="severity-${r.severity}">
      <td>${icon} ${text}</td>
      <td>${escapeHTML(r.sample.font)}</td>
      <td>${r.sample.maxWidth ?? 300}px</td>
      <td>Pretext ${r.pretextLineCount} / DOM ${r.domLineCount}</td>
      <td>Δ${r.heightDelta >= 0 ? '+' : ''}${r.heightDelta.toFixed(1)}px (${r.heightPercentError.toFixed(1)}%)</td>
      <td>${r.causes.join(', ') || '—'}</td>
    </tr>`
      })
      .join('\n')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Pretext Measurement Validator Report</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; }
    th { background: #f5f5f5; }
    .severity-pass { background: #f0fff0; }
    .severity-warning { background: #fffbe6; }
    .severity-error { background: #fff0f0; }
    .severity-critical { background: #ffd6d6; font-weight: bold; }
    summary { font-size: 1.1rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>Pretext Measurement Validator</h1>
  <p class="summary">
    ✅ ${report.passed}/${report.total} passed (${pct}%)
    &nbsp;⚠️ ${report.warnings} warnings
    &nbsp;❌ ${report.errors} errors
    &nbsp;🔴 ${report.criticals} critical
    &nbsp;<small>${report.timestamp}</small>
  </p>
  <table>
    <thead>
      <tr>
        <th>Text</th>
        <th>Font</th>
        <th>Width</th>
        <th>Lines (Pretext/DOM)</th>
        <th>Height Δ</th>
        <th>Causes</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>`
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function severityIcon(s: ResultSeverity): string {
  switch (s) {
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

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Convenience re-exports of Pretext primitives used by validators
// ---------------------------------------------------------------------------
export { clearCache, layout, layoutWithLines, prepare, prepareWithSegments, setLocale } from './layout.js'
