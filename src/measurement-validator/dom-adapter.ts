/**
 * DOM Measurement Adapter
 */

import type { MeasurementSample } from './types.js'

export interface DOMTextMetrics {
  lineCount: number
  lineWidths: number[]
  totalHeight: number
  firstLineHeight: number
}

export async function measureDOMText(sample: MeasurementSample): Promise<DOMTextMetrics> {
  if (typeof document !== 'undefined') {
    await document.fonts.ready
  }

  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.visibility = 'hidden'
  container.style.left = '-9999px'
  container.style.top = '-9999px'
  container.style.font = sample.font
  container.style.whiteSpace = sample.whiteSpace ?? 'normal'
  container.style.width = `${sample.maxWidth}px`
  container.style.wordWrap = 'break-word'
  container.style.overflow = 'hidden'

  if (sample.lineHeight !== undefined) {
    container.style.lineHeight = `${sample.lineHeight}px`
  }

  document.body!.appendChild(container)
  container.textContent = sample.text

  try {
    const totalHeight = container.offsetHeight
    const lineHeight = sample.lineHeight ?? getComputedLineHeight(container)
    const lineCount = Math.max(1, Math.ceil(totalHeight / lineHeight))
    const lineWidths = measureLineWidths(container, lineCount)

    return {
      lineCount,
      lineWidths,
      totalHeight,
      firstLineHeight: lineHeight,
    }
  } finally {
    document.body!.removeChild(container)
  }
}

export function getComputedLineHeight(element: HTMLElement): number {
  const computed = window.getComputedStyle(element)
  const lineHeightStr = computed.lineHeight

  if (lineHeightStr === 'normal') {
    const parsed = parseInt(computed.fontSize, 10)
    const fontSize = Number.isNaN(parsed) ? 16 : parsed
    return fontSize * 1.2
  }

  const parsed = parseFloat(lineHeightStr)
  return Number.isNaN(parsed) ? 16 : parsed
}

export function measureLineWidths(container: HTMLElement, lineCount: number): number[] {
  const lineWidths: number[] = []

  if (container.textContent === null || container.textContent === '' || lineCount === 0) {
    return lineWidths
  }

  const containerWidth = container.offsetWidth

  for (let i = 0; i < lineCount; i++) {
    lineWidths.push(containerWidth)
  }

  return lineWidths
}
