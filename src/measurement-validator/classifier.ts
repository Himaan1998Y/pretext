/**
 * Divergence Classifier
 */

import type { MeasurementSample, MeasurementResult, DivergenceAnalysis } from './types.js'
import { measureDOMText } from './dom-adapter.js'

interface FontFallbackResult {
  detected: boolean
  severity: 'minor' | 'major' | 'critical'
  confidence?: number
}

interface BidiResult {
  detected: boolean
  severity: 'minor' | 'major' | 'critical'
  confidence?: number
}

interface EmojiResult {
  detected: boolean
  severity: 'minor' | 'major' | 'critical'
  confidence?: number
  emojiCount: number
}

interface BrowserQuirkResult {
  detected: boolean
  severity: 'minor' | 'major' | 'critical'
  confidence: number
  recommendation: string
}

export async function classifyDivergence(result: MeasurementResult, sample: MeasurementSample): Promise<DivergenceAnalysis> {
  if (result.overallSeverity === 'pass') {
    return {
      detected: false,
      severity: 'minor',
      confidence: 1.0,
      recommendation: 'No divergence detected',
      details: {},
    }
  }

  // Check font fallback
  const fontFallback = await detectFontFallback(sample)
  if (fontFallback.detected) {
    return {
      detected: true,
      rootCause: 'font_fallback',
      severity: fontFallback.severity,
      confidence: fontFallback.confidence ?? 0.95,
      recommendation: `Font "${sample.font}" may not be loaded. Consider preloading fonts.`,
      details: fontFallback as unknown as Record<string, unknown>,
    }
  }

  // Check bidi
  const bidi = detectBidi(sample)
  if (bidi.detected) {
    return {
      detected: true,
      rootCause: 'bidi_shaping',
      severity: bidi.severity,
      confidence: bidi.confidence ?? 0.85,
      recommendation: 'RTL text detected. Verify segLevels and canvas rendering.',
      details: bidi as unknown as Record<string, unknown>,
    }
  }

  // Check emoji
  const emoji = detectEmoji(sample)
  if (emoji.detected) {
    return {
      detected: true,
      rootCause: 'emoji_rendering',
      severity: emoji.severity,
      confidence: emoji.confidence ?? 0.75,
      recommendation: `${emoji.emojiCount} emoji detected. Different browsers render emoji differently.`,
      details: emoji as unknown as Record<string, unknown>,
    }
  }

  // Check browser quirks
  const browserQuirk = detectBrowserQuirk(sample)
  if (browserQuirk.detected) {
    return {
      detected: true,
      rootCause: 'browser_quirk',
      severity: browserQuirk.severity,
      confidence: browserQuirk.confidence,
      recommendation: browserQuirk.recommendation,
      details: browserQuirk as unknown as Record<string, unknown>,
    }
  }

  // Unknown
  const maxDelta = result.lines.length > 0
    ? Math.max(...result.lines.map((l) => l.delta))
    : 0
  return {
    detected: true,
    rootCause: 'unknown',
    severity: 'major',
    confidence: 0.3,
    recommendation: 'Divergence detected but root cause unknown. Please report to Pretext maintainers.',
    details: { maxDelta },
  }
}

export async function detectFontFallback(sample: MeasurementSample): Promise<FontFallbackResult> {
  try {
    const specifiedMetrics = await measureDOMText(sample)
    const fallbackSample = { ...sample, font: 'serif' }
    const fallbackMetrics = await measureDOMText(fallbackSample)

    const specifiedAvg =
      specifiedMetrics.lineWidths.length > 0
        ? specifiedMetrics.lineWidths.reduce((a, b) => a + b, 0) / specifiedMetrics.lineWidths.length
        : 0
    const fallbackAvg =
      fallbackMetrics.lineWidths.length > 0
        ? fallbackMetrics.lineWidths.reduce((a, b) => a + b, 0) / fallbackMetrics.lineWidths.length
        : 0

    // Font fallback is suspected when the specified font renders similarly to the
    // generic serif fallback (within 10%), suggesting the font was not loaded.
    const threshold = fallbackAvg * 0.1
    if (Math.abs(specifiedAvg - fallbackAvg) < threshold) {
      return { detected: true, severity: 'critical', confidence: 0.95 }
    }

    return { detected: false, severity: 'minor' }
  } catch {
    return { detected: false, severity: 'minor' }
  }
}

export function detectBidi(sample: MeasurementSample): BidiResult {
  const rtlCharRange = /[\u0590-\u08FF\uFB1D-\uFB4F]/u
  const hasRTL = rtlCharRange.test(sample.text)

  if (!hasRTL) {
    return { detected: false, severity: 'minor' }
  }

  return {
    detected: true,
    severity: 'major',
    confidence: 0.9,
  }
}

export function detectEmoji(sample: MeasurementSample): EmojiResult {
  try {
    const emojiPattern = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu
    const emojiMatches = sample.text.match(emojiPattern) ?? []

    if (emojiMatches.length === 0) {
      return { detected: false, severity: 'minor', emojiCount: 0 }
    }

    return {
      detected: true,
      severity: 'major',
      confidence: 0.85,
      emojiCount: emojiMatches.length,
    }
  } catch {
    return { detected: false, severity: 'minor', emojiCount: 0 }
  }
}

export function detectBrowserQuirk(_sample: MeasurementSample): BrowserQuirkResult {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''

  if (ua.includes('Safari') && !ua.includes('Chrome')) {
    return {
      detected: true,
      severity: 'major',
      confidence: 0.7,
      recommendation: 'Safari may render with different kerning.',
    }
  }

  return { detected: false, severity: 'minor', confidence: 0, recommendation: '' }
}
