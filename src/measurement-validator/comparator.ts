// Comparator: canvas vs DOM line-count divergence detection.
// Compares Pretext's canvas-based measurement against the browser DOM rendering
// to detect layout divergences that could affect real-world text layout.

import type {
  DivergenceReason,
  Language,
  MeasurementResult,
  Severity,
  ValidationOptions,
} from './types.js'

let nextId = 1

function makeMeasurementId(): string {
  return `mv-${Date.now()}-${nextId++}`
}

function classifySeverity(divergencePixels: number): Severity {
  if (divergencePixels === 0) return 'pass'
  if (divergencePixels < 2) return 'warning'
  return 'critical'
}

function classifyReason(
  text: string,
  _language: Language,
  _font: string
): DivergenceReason {
  // Emoji presentation characters
  if (/\p{Emoji_Presentation}/u.test(text)) return 'emoji_width'
  // RTL languages that use bidi reordering
  if (/[\u0600-\u06FF\u0590-\u05FF\u0750-\u077F]/u.test(text))
    return 'bidi_reorder'
  // Tab characters hint at tab-width differences
  if (/\t/.test(text)) return 'tab_width'
  // Soft hyphens
  if (/\u00AD/.test(text)) return 'soft_hyphen'
  // CJK text can hit different line-break policies
  if (
    /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3040-\u309F\u30A0-\u30FF]/u.test(
      text
    )
  )
    return 'line_break_policy'
  return 'unknown'
}

// Simulate a validation run in a Node/Bun environment without a real browser.
// In a real browser environment this would use a canvas context and a DOM node.
// Here it stubs the measurement to enable CLI, CI, and database usage in headless
// environments while keeping the API shape identical to what a browser shim returns.
export function compareMeasurement(
  text: string,
  language: Language,
  font: string,
  fontSize: number,
  containerWidth: number,
  canvasLineCount: number,
  domLineCount: number,
  durationMs: number
): MeasurementResult {
  const divergePixels =
    Math.abs(canvasLineCount - domLineCount) * (fontSize * 1.2)
  const severity = classifySeverity(divergePixels)
  const reason: DivergenceReason =
    divergePixels > 0 ? classifyReason(text, language, font) : 'unknown'

  return {
    id: makeMeasurementId(),
    language,
    font,
    fontSize,
    text,
    containerWidth,
    canvasLineCount,
    domLineCount,
    diverged: divergePixels > 0,
    divergencePixels: divergePixels,
    severity,
    reason,
    timestamp: Date.now(),
    durationMs,
  }
}

// Validate a batch of text samples.
export async function validateSamples(
  samples: Array<{
    text: string
    language: Language
    font?: string
    fontSize?: number
    containerWidth?: number
    canvasLineCount: number
    domLineCount: number
    durationMs?: number
  }>,
  _options: ValidationOptions = {}
): Promise<MeasurementResult[]> {
  return samples.map((s) =>
    compareMeasurement(
      s.text,
      s.language,
      s.font ?? 'system-ui',
      s.fontSize ?? 16,
      s.containerWidth ?? 300,
      s.canvasLineCount,
      s.domLineCount,
      s.durationMs ?? 0
    )
  )
}
