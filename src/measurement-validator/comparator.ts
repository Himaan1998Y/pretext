// Comparison engine: runs Pretext layout and DOM measurement on the same
// sample, then produces a structured ComparisonResult.

import { prepareWithSegments, layoutWithLines } from '../layout.js'
import { measureDOM } from './dom-adapter.js'
import {
  classifySeverity,
  type ComparisonResult,
  type DivergenceMetrics,
  type LineComparison,
  type MeasurementSample,
} from './types.js'

/** Parse the numeric font-size (px) from a CSS font string like '16px Arial'. */
function parseFontSizePx(font: string): number {
  const m = font.match(/(\d+(?:\.\d+)?)\s*px/)
  return m !== null ? Number.parseFloat(m[1]!) : 16
}

/**
 * Compare Pretext measurements against DOM measurements for a single sample.
 *
 * Works in browser environments only (DOM measurement requires `document`).
 */
export async function compare(sample: MeasurementSample): Promise<ComparisonResult> {
  const maxWidth = sample.maxWidth ?? 300
  const fontSize = parseFontSizePx(sample.font)
  const lineHeight = sample.lineHeight ?? fontSize * 1.2

  // --- Pretext layout ---
  const prepared = prepareWithSegments(sample.text, sample.font, {
    whiteSpace: sample.whiteSpace,
    wordBreak: sample.wordBreak,
  })
  const pretextResult = layoutWithLines(prepared, maxWidth, lineHeight)
  const pretextLines = pretextResult.lines

  // --- DOM measurement ---
  const domMeasurement = await measureDOM(sample)
  const domLines = domMeasurement.lines

  // --- Per-line comparison ---
  const lineComparisons: LineComparison[] = []
  const comparableCount = Math.min(pretextLines.length, domLines.length)

  for (let i = 0; i < comparableCount; i++) {
    const pLine = pretextLines[i]!
    const dLine = domLines[i]!
    const delta = Math.abs(pLine.width - dLine.width)
    const relativeError = dLine.width > 0 ? delta / dLine.width : 0
    lineComparisons.push({
      lineNumber: i + 1,
      text: pLine.text,
      pretextWidth: pLine.width,
      domWidth: dLine.width,
      delta,
      relativeError,
      severity: classifySeverity(delta),
    })
  }

  // Lines only in Pretext (extra lines).
  for (let i = comparableCount; i < pretextLines.length; i++) {
    const pLine = pretextLines[i]!
    lineComparisons.push({
      lineNumber: i + 1,
      text: pLine.text,
      pretextWidth: pLine.width,
      domWidth: 0,
      delta: pLine.width,
      relativeError: 1,
      severity: 'critical',
    })
  }

  // Lines only in DOM (extra lines).
  for (let i = comparableCount; i < domLines.length; i++) {
    const dLine = domLines[i]!
    lineComparisons.push({
      lineNumber: i + 1,
      text: dLine.text,
      pretextWidth: 0,
      domWidth: dLine.width,
      delta: dLine.width,
      relativeError: 1,
      severity: 'critical',
    })
  }

  // --- Aggregate metrics ---
  const maxDelta = lineComparisons.reduce((acc, l) => Math.max(acc, l.delta), 0)
  const avgDelta =
    lineComparisons.length > 0
      ? lineComparisons.reduce((acc, l) => acc + l.delta, 0) / lineComparisons.length
      : 0

  const metrics: DivergenceMetrics = {
    lineCountMatch: pretextLines.length === domLines.length,
    pretextLineCount: pretextLines.length,
    domLineCount: domLines.length,
    maxLineDelta: maxDelta,
    averageDelta: avgDelta,
    severity: classifySeverity(maxDelta),
  }

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''

  return {
    sample,
    metrics,
    lines: lineComparisons,
    rootCause: detectRootCause(metrics, sample, userAgent),
    timestamp: new Date().toISOString(),
    userAgent,
  }
}

/**
 * Run compare() on an array of samples and return all results.
 */
export async function compareAll(samples: MeasurementSample[]): Promise<ComparisonResult[]> {
  const results: ComparisonResult[] = []
  for (const sample of samples) {
    results.push(await compare(sample))
  }
  return results
}

// Very lightweight root-cause heuristics — kept intentionally narrow for Phase 1.
function detectRootCause(
  metrics: DivergenceMetrics,
  sample: MeasurementSample,
  userAgent: string,
): string | undefined {
  if (metrics.severity === 'exact') return undefined

  // Bidi / RTL text.
  if (sample.direction === 'rtl' || /[\u0590-\u08FF\uFB1D-\uFB4F]/.test(sample.text)) {
    if (metrics.severity === 'major' || metrics.severity === 'critical') {
      return 'Possible bidi/RTL shaping divergence: RTL characters detected with significant delta'
    }
  }

  // Emoji.
  if (/\p{Emoji_Presentation}/u.test(sample.text)) {
    return 'Possible emoji correction divergence: emoji glyphs detected'
  }

  // Line count mismatch is its own class.
  if (!metrics.lineCountMatch) {
    return `Line count mismatch: Pretext produced ${metrics.pretextLineCount} lines, DOM produced ${metrics.domLineCount}`
  }

  // Safari kerning.
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    if (metrics.severity === 'major' || metrics.severity === 'critical') {
      return 'Possible Safari kerning/hinting divergence'
    }
  }

  if (metrics.severity === 'major' || metrics.severity === 'critical') {
    return 'Unknown measurement divergence — check font loading or canvas calibration'
  }

  return undefined
}
