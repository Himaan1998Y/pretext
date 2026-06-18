// Comparator: compare Pretext layout height against a reference DOM height.
//
// In a browser environment the DOM reference height comes from creating a
// temporary element and measuring its offsetHeight. Outside a browser (Node /
// Bun unit tests) the DOM is unavailable, so domHeight is left as NaN and the
// severity is always 'exact' — callers can detect the browser-less path via
// isNaN(result.domHeight).

import { layout, prepare, setLocale, type PrepareOptions } from '../layout.js'
import type { ComparisonResult, DivergenceSeverity, MeasurementSample } from './types.js'

function classifySeverity(diffPx: number): DivergenceSeverity {
  if (diffPx <= 1) return 'exact'
  if (diffPx <= 4) return 'minor'
  if (diffPx <= 20) return 'major'
  return 'critical'
}

/**
 * Measure the reference DOM height for a sample.
 *
 * Creates a temporary `<div>` with the same font, width and text as the
 * sample, appends it off-screen, reads `offsetHeight`, then removes it.
 * Returns NaN when the DOM is not available (non-browser environments).
 */
function measureDomHeight(sample: MeasurementSample): number {
  if (typeof document === 'undefined') return Number.NaN

  const el = document.createElement('div')
  el.style.cssText = [
    'position:absolute',
    'visibility:hidden',
    'pointer-events:none',
    'white-space:normal',
    'word-break:normal',
    'overflow-wrap:break-word',
    `font:${sample.font}`,
    `width:${sample.maxWidth}px`,
    `line-height:${sample.lineHeight}px`,
  ].join(';')
  el.textContent = sample.text
  document.body.appendChild(el)
  const h = el.offsetHeight
  document.body.removeChild(el)
  return h
}

/**
 * Compare Pretext layout height against a DOM reference height for one sample.
 */
export function compare(sample: MeasurementSample): ComparisonResult {
  const start = performance.now()

  const options: PrepareOptions = {}

  // Apply locale if specified, then restore the default after measuring.
  if (sample.language !== undefined) {
    setLocale(sample.language)
  }

  const prepared = prepare(sample.text, sample.font, options)

  if (sample.language !== undefined) {
    setLocale(undefined)
  }

  const { height: pretextHeight } = layout(prepared, sample.maxWidth, sample.lineHeight)

  const domHeight = measureDomHeight(sample)
  const diffPx = Number.isNaN(domHeight) ? 0 : Math.abs(pretextHeight - domHeight)
  const severity = classifySeverity(diffPx)

  const executionTimeMs = performance.now() - start

  return {
    sample,
    pretextHeight,
    domHeight,
    diffPx,
    severity,
    executionTimeMs,
  }
}
