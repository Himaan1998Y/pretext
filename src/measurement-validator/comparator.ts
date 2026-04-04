/**
 * Measurement Comparator
 */

import type { MeasurementSample, MeasurementResult, LineComparison } from './types.js'
import { SEVERITY_THRESHOLDS } from './types.js'
import { measureDOMText } from './dom-adapter.js'

export interface PretextLayoutResult {
  lines?: Array<{ text?: string; width?: number }>
}

export class MeasurementComparator {
  async compare(sample: MeasurementSample, pretextLayout: PretextLayoutResult): Promise<MeasurementResult> {
    const startTime = performance.now()

    const domMetrics = await measureDOMText(sample)

    const lines: LineComparison[] = []
    let exactMatches = 0
    let minorDelta = 0
    let majorDelta = 0
    let criticalDelta = 0

    const pretextLines = pretextLayout.lines ?? []
    const maxLines = Math.max(pretextLines.length, domMetrics.lineCount)

    for (let i = 0; i < maxLines; i++) {
      const pretextLine = pretextLines[i]
      const domWidth = domMetrics.lineWidths[i] ?? 0
      const pretextWidth = pretextLine?.width ?? 0

      const delta = Math.abs(pretextWidth - domWidth)
      const percentError = domWidth > 0 ? (delta / domWidth) * 100 : 0
      const severity = classifySeverity(delta)

      lines.push({
        index: i,
        text: pretextLine?.text ?? '',
        pretextWidth,
        domWidth,
        delta,
        percentError,
        severity,
      })

      if (severity === 'exact') exactMatches++
      else if (severity === 'minor') minorDelta++
      else if (severity === 'major') majorDelta++
      else if (severity === 'critical') criticalDelta++
    }

    const overallSeverity =
      criticalDelta > 0 ? 'critical' : majorDelta > 0 ? 'error' : minorDelta > 0 ? 'warning' : 'pass'
    const executionTimeMs = performance.now() - startTime

    return {
      sample,
      lines,
      totalLines: maxLines,
      exactMatches,
      minorDelta,
      majorDelta,
      criticalDelta,
      overallSeverity,
      timestamp: new Date().toISOString(),
      executionTimeMs,
    }
  }
}

export function classifySeverity(delta: number): 'exact' | 'minor' | 'major' | 'critical' {
  if (delta < SEVERITY_THRESHOLDS.exact) return 'exact'
  if (delta < SEVERITY_THRESHOLDS.minor) return 'minor'
  if (delta < SEVERITY_THRESHOLDS.major) return 'major'
  return 'critical'
}
