// DOM measurement adapter.
//
// Measures text width and line layout using the browser's Range API.
// This is the ground-truth counterpart to Pretext's canvas-based measurement.
//
// Only valid in a browser environment that provides document, Range, and
// getBoundingClientRect.  The adapter is deliberately thin so it can be
// replaced with a stub in unit tests.

import type { MeasurementSample } from './types.js'

export type DOMLineMetrics = {
  text: string
  width: number
}

export type DOMAdapter = {
  measureLines(sample: MeasurementSample): DOMLineMetrics[]
  cleanup(): void
}

// Sentinel element created once per adapter instance and reused across calls.
type AdapterState = {
  container: HTMLDivElement
  textNode: Text
}

function applyStyles(container: HTMLDivElement, sample: MeasurementSample): void {
  const style = container.style
  style.position = 'absolute'
  style.visibility = 'hidden'
  style.pointerEvents = 'none'
  style.whiteSpace = sample.whiteSpace === 'pre-wrap' ? 'pre-wrap' : 'normal'
  style.wordBreak = sample.wordBreak ?? 'normal'
  style.overflowWrap = 'break-word'
  style.font = sample.font
  style.lineHeight = `${sample.lineHeight}px`
  style.width = `${sample.maxWidth}px`
}

function createState(): AdapterState {
  const container = document.createElement('div')
  const textNode = document.createTextNode('')
  container.appendChild(textNode)
  document.body.appendChild(container)
  return { container, textNode }
}

// Extract per-line text and widths using client Range rectangles.
// Each line is identified by a distinct vertical band of DOMRect tops.
function extractLinesFromRange(container: HTMLDivElement, text: string): DOMLineMetrics[] {
  const range = document.createRange()
  const textNode = container.firstChild
  if (textNode === null || textNode.nodeType !== Node.TEXT_NODE) return []

  const lineHeight = parseFloat(container.style.lineHeight) || 0
  const lines: DOMLineMetrics[] = []

  // Walk character-by-character and group by vertical band.
  // Rects at the same `top` (within 1px) belong to the same line.
  let lineStartChar = 0
  let currentTop: number | null = null
  let currentWidth = 0

  for (let i = 0; i <= text.length; i++) {
    if (i < text.length) {
      range.setStart(textNode, i)
      range.setEnd(textNode, i + 1)
      const rects = range.getClientRects()
      if (rects.length === 0) continue
      const rect = rects[0]!

      if (currentTop === null) {
        currentTop = rect.top
        currentWidth = rect.right
      } else if (Math.abs(rect.top - currentTop) > lineHeight * 0.5) {
        // New line detected — capture previous line
        const lineText = text.slice(lineStartChar, i)
        lines.push({ text: lineText, width: currentWidth - container.getBoundingClientRect().left })
        lineStartChar = i
        currentTop = rect.top
        currentWidth = rect.right
      } else {
        currentWidth = Math.max(currentWidth, rect.right)
      }
    } else if (currentTop !== null) {
      // Flush the last line
      const lineText = text.slice(lineStartChar)
      lines.push({ text: lineText, width: currentWidth - container.getBoundingClientRect().left })
    }
  }

  return lines
}

export function createDOMAdapter(): DOMAdapter {
  let state: AdapterState | null = null

  function getState(): AdapterState {
    if (state === null) {
      state = createState()
    }
    return state
  }

  return {
    measureLines(sample: MeasurementSample): DOMLineMetrics[] {
      const { container, textNode } = getState()
      applyStyles(container, sample)
      textNode.nodeValue = sample.text
      return extractLinesFromRange(container, sample.text)
    },

    cleanup(): void {
      if (state !== null) {
        state.container.remove()
        state = null
      }
    },
  }
}

// Pure-function helper: given a measured container element and raw text,
// extract line metrics without maintaining any persistent state.
// Useful for one-off measurements in scripts and tests.
export function measureDOMLines(sample: MeasurementSample): DOMLineMetrics[] {
  const adapter = createDOMAdapter()
  try {
    return adapter.measureLines(sample)
  } finally {
    adapter.cleanup()
  }
}
