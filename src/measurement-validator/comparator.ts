// Comparator: Pretext canvas measurement vs DOM measurement.
//
// Takes a MeasurementSample, runs Pretext layoutWithLines + a DOM adapter,
// and produces a MeasurementResult with per-line deltas and severity ratings.

import { layoutWithLines, prepareWithSegments } from '../layout.js'
import type { DOMAdapter, DOMLineMetrics } from './dom-adapter.js'
import {
  DEFAULT_TOLERANCE,
  type LineSeverity,
  type MeasurementLinePair,
  type MeasurementResult,
  type MeasurementSample,
  type ToleranceConfig,
} from './types.js'

function classifyDelta(delta: number, tol: ToleranceConfig): LineSeverity {
  const abs = Math.abs(delta)
  if (abs <= tol.passDelta) return 'pass'
  if (abs <= tol.minorDelta) return 'minor'
  if (abs <= tol.majorDelta) return 'major'
  return 'critical'
}

function worstSeverity(severities: LineSeverity[]): LineSeverity {
  if (severities.includes('critical')) return 'critical'
  if (severities.includes('major')) return 'major'
  if (severities.includes('minor')) return 'minor'
  return 'pass'
}

export type ComparatorOptions = {
  tolerance?: ToleranceConfig | undefined
}

export function compareMeasurements(
  sample: MeasurementSample,
  domLines: DOMLineMetrics[],
  options: ComparatorOptions = {},
): MeasurementResult {
  const startMs = Date.now()
  const tol = options.tolerance ?? DEFAULT_TOLERANCE

  const prepareOptions: import('../layout.js').PrepareOptions = {}
  if (sample.wordBreak !== undefined) prepareOptions.wordBreak = sample.wordBreak
  if (sample.whiteSpace !== undefined) prepareOptions.whiteSpace = sample.whiteSpace

  const prepared = prepareWithSegments(sample.text, sample.font, prepareOptions)
  const pretextResult = layoutWithLines(prepared, sample.maxWidth, sample.lineHeight)
  const pretextLines = pretextResult.lines

  const lineCount = Math.max(pretextLines.length, domLines.length)
  const pairs: MeasurementLinePair[] = []

  for (let i = 0; i < lineCount; i++) {
    const pretextLine = pretextLines[i]
    const domLine = domLines[i]
    const pretextWidth = pretextLine?.width ?? 0
    const domWidth = domLine?.width ?? 0
    const delta = pretextWidth - domWidth
    const severity = classifyDelta(delta, tol)

    pairs.push({
      lineIndex: i,
      pretextText: pretextLine?.text ?? '',
      pretextWidth,
      domText: domLine?.text ?? '',
      domWidth,
      delta,
      severity,
    })
  }

  const severities = pairs.map((p) => p.severity)
  const passCount = severities.filter((s) => s === 'pass').length
  const maxDelta = pairs.reduce((acc, p) => Math.max(acc, Math.abs(p.delta)), 0)

  return {
    sample,
    pretextLineCount: pretextLines.length,
    domLineCount: domLines.length,
    lineCountMatch: pretextLines.length === domLines.length,
    lines: pairs,
    overallSeverity: worstSeverity(severities),
    passRate: lineCount > 0 ? passCount / lineCount : 1,
    maxDelta,
    durationMs: Date.now() - startMs,
  }
}

export type Comparator = {
  compare(sample: MeasurementSample, options?: ComparatorOptions): MeasurementResult
  dispose(): void
}

export function createComparator(adapter: DOMAdapter): Comparator {
  return {
    compare(sample: MeasurementSample, options: ComparatorOptions = {}): MeasurementResult {
      const domLines = adapter.measureLines(sample)
      return compareMeasurements(sample, domLines, options)
    },

    dispose(): void {
      adapter.cleanup()
    },
  }
}
