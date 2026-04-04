// DOM adapter for measuring text using actual browser rendering.
//
// Uses the Range API to measure line widths after laying text out in a hidden
// DOM container. This is ground-truth for Pretext's canvas-based measurements.
//
// Only works in a browser environment (document / document.fonts must exist).

import type { DOMLine, DOMMeasurement, MeasurementSample } from './types.js'

/**
 * Measure text in the DOM and return per-line widths.
 *
 * The function creates a temporary hidden container, sets font/width/direction
 * styling on it, appends it to `document.body`, waits for fonts, walks the
 * layout with Range selection to extract line rects, then removes the element.
 */
export async function measureDOM(sample: MeasurementSample): Promise<DOMMeasurement> {
  if (typeof document === 'undefined') {
    throw new Error('measureDOM requires a browser environment (document not available)')
  }

  const container = document.createElement('div')
  applyStyles(container, sample)
  container.textContent = sample.text
  document.body.appendChild(container)

  try {
    // Wait for fonts to be ready so metrics are correct.
    if (typeof document.fonts !== 'undefined') {
      await document.fonts.ready
    }

    const lines = extractLines(container, sample)
    const totalHeight = container.getBoundingClientRect().height
    return { lines, totalHeight }
  } finally {
    document.body.removeChild(container)
  }
}

function applyStyles(el: HTMLDivElement, sample: MeasurementSample): void {
  const style = el.style
  style.position = 'absolute'
  style.top = '-9999px'
  style.left = '-9999px'
  style.visibility = 'hidden'
  style.pointerEvents = 'none'
  style.font = sample.font
  style.whiteSpace = sample.whiteSpace === 'pre-wrap' ? 'pre-wrap' : 'normal'
  style.wordBreak = sample.wordBreak === 'keep-all' ? 'keep-all' : 'normal'
  style.direction = sample.direction === 'rtl' ? 'rtl' : 'ltr'
  style.overflowWrap = 'break-word'
  style.lineBreak = 'auto'
  style.margin = '0'
  style.padding = '0'
  style.border = 'none'
  style.boxSizing = 'content-box'

  const maxWidth = sample.maxWidth ?? 300
  style.width = `${maxWidth}px`

  if (sample.lineHeight !== undefined) {
    style.lineHeight = `${sample.lineHeight}px`
  }
}

/**
 * Walk the text node character-by-character using Range to detect line breaks
 * and accumulate per-line widths.
 */
function extractLines(container: HTMLDivElement, sample: MeasurementSample): DOMLine[] {
  const textNode = container.firstChild
  if (textNode === null || textNode.nodeType !== Node.TEXT_NODE) {
    return []
  }

  const text = sample.text
  if (text.length === 0) return []

  const range = document.createRange()
  const lines: DOMLine[] = []

  // Group characters by their top-offset (y-position) to detect line breaks.
  // We probe every grapheme cluster boundary using a Range around each character.
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const graphemes: Array<{ segment: string; index: number }> = []
  for (const seg of segmenter.segment(text)) {
    graphemes.push({ segment: seg.segment, index: seg.index })
  }

  if (graphemes.length === 0) return []

  // Measure each grapheme rect.
  type GraphemeRect = { top: number; right: number; width: number; segment: string; index: number }
  const rects: GraphemeRect[] = []

  for (const g of graphemes) {
    const start = g.index
    const end = start + g.segment.length
    range.setStart(textNode, start)
    range.setEnd(textNode, end)
    const rect = range.getBoundingClientRect()
    rects.push({ top: rect.top, right: rect.right, width: rect.width, segment: g.segment, index: g.index })
  }

  // Group by line (same top ± tolerance).
  const LINE_TOP_TOLERANCE = 1
  let currentLineTop = rects[0]!.top
  let currentLineText = ''
  let currentLineMaxRight = 0
  let currentLineMinLeft = rects[0]!.right - rects[0]!.width

  for (const r of rects) {
    if (Math.abs(r.top - currentLineTop) > LINE_TOP_TOLERANCE) {
      // New line detected — push the previous one.
      lines.push({
        text: currentLineText,
        width: currentLineMaxRight - currentLineMinLeft,
      })
      currentLineText = r.segment
      currentLineTop = r.top
      currentLineMinLeft = r.right - r.width
      currentLineMaxRight = r.right
    } else {
      currentLineText += r.segment
      if (r.right > currentLineMaxRight) currentLineMaxRight = r.right
    }
  }
  // Push the last line.
  lines.push({
    text: currentLineText,
    width: currentLineMaxRight - currentLineMinLeft,
  })

  // Sanity-check: if we got zero width on all lines (e.g. JSDOM has no layout
  // engine), fall back to a single line with the container width.
  const allZeroWidths = lines.every(l => l.width === 0)
  if (allZeroWidths) {
    const containerWidth = container.getBoundingClientRect().width
    return [{ text, width: containerWidth > 0 ? containerWidth : (sample.maxWidth ?? 300) }]
  }

  return lines
}

