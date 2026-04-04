// Divergence Classifier — Phase 2.
//
// Identifies WHY measurements diverge between Pretext and DOM by running
// a priority-ordered chain of detection strategies:
//
//   1. Font fallback   (highest confidence — font not loaded)
//   2. Bidi shaping    (RTL/mixed text)
//   3. Emoji rendering (emoji codepoints with browser-specific metrics)
//   4. Browser quirk   (Safari kerning, variable fonts, OS rendering)
//   5. Unknown         (divergence found but cause unclear)
//
// Each detector returns a small analysis object; the first "detected" hit
// wins and its DivergenceAnalysis is returned.

import type { DOMAdapter } from './dom-adapter.js'
import type {
  DivergenceAnalysis,
  DivergenceRootCause,
  MeasurementResult,
  MeasurementSample,
} from './types.js'

// --- Internal sub-analysis types ---

type SubAnalysis = {
  detected: boolean
  severity: 'minor' | 'major' | 'critical'
  confidence: number
  details: Record<string, unknown>
  recommendation: string
}

function noDetection(): SubAnalysis {
  return { detected: false, severity: 'minor', confidence: 0, details: {}, recommendation: '' }
}

// --- 1. Font fallback detection ---
//
// Re-measures with the system fallback font (serif) and checks whether
// the fallback matches DOM better than the requested font.  If so, the
// specified font was likely not loaded.

async function detectFontFallback(
  sample: MeasurementSample,
  adapter: DOMAdapter,
): Promise<SubAnalysis> {
  const fallbackSample: MeasurementSample = { ...sample, font: replaceFontFamily(sample.font, 'serif') }
  const specifiedDOMLines = adapter.measureLines(sample)
  const fallbackDOMLines = adapter.measureLines(fallbackSample)

  // Compare total widths
  const specifiedTotal = specifiedDOMLines.reduce((s, l) => s + l.width, 0)
  const fallbackTotal = fallbackDOMLines.reduce((s, l) => s + l.width, 0)

  // If the two totals are within 1% of each other the font is likely not loaded
  // (browser is already silently falling back to the same face for both requests).
  if (specifiedTotal > 0 && Math.abs(specifiedTotal - fallbackTotal) / specifiedTotal < 0.01) {
    return {
      detected: true,
      severity: 'critical',
      confidence: 0.9,
      details: {
        fontSpecified: sample.font,
        fontDetected: 'serif (system fallback)',
        specifiedTotal,
        fallbackTotal,
      },
      recommendation:
        `Font "${sample.font}" may not be loaded. ` +
        'Consider preloading fonts or using a system font (serif/sans-serif).',
    }
  }

  return noDetection()
}

// Replace the family portion of a CSS font string, preserving size/weight/style.
function replaceFontFamily(font: string, newFamily: string): string {
  // CSS font shorthand: [style] [variant] [weight] [size/line-height] family
  // The family is always last — replace the last whitespace-delimited token(s).
  const parts = font.trim().split(/\s+/)
  // The size token contains a digit (e.g. "16px")
  const sizeIdx = parts.findIndex((p) => /\d/.test(p))
  if (sizeIdx !== -1) {
    return [...parts.slice(0, sizeIdx + 1), newFamily].join(' ')
  }
  return `${font} ${newFamily}`
}

// --- 2. Bidi detection ---
//
// Checks for RTL Unicode ranges.  Does not require DOM access.

const RTL_CHAR_RE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u

function detectBidi(sample: MeasurementSample): SubAnalysis {
  const hasRTL = RTL_CHAR_RE.test(sample.text)
  if (!hasRTL) return noDetection()

  const allRTL = [...sample.text].every(
    (ch) => RTL_CHAR_RE.test(ch) || /\s/.test(ch) || /\p{P}/u.test(ch),
  )

  return {
    detected: true,
    severity: 'major',
    confidence: 0.85,
    details: { hasRTL: true, isMixedBidi: !allRTL },
    recommendation:
      'RTL text detected. Verify that segLevels are available in PreparedTextWithSegments ' +
      'and that canvas.measureText matches DOM for this script.',
  }
}

// --- 3. Emoji detection ---
//
// Checks for emoji presentation codepoints.

const EMOJI_RE = /\p{Emoji_Presentation}/u

function detectEmoji(sample: MeasurementSample): SubAnalysis {
  const hasEmoji = EMOJI_RE.test(sample.text)
  if (!hasEmoji) return noDetection()

  return {
    detected: true,
    severity: 'minor',
    confidence: 0.75,
    details: { hasEmoji: true },
    recommendation:
      'Emoji detected. Different browsers render emoji with different metrics. ' +
      'Pretext applies automatic emoji-correction for Chrome/Firefox canvas at small sizes. ' +
      'Consider testing emoji-heavy text separately.',
  }
}

// --- 4. Browser-specific quirk detection ---
//
// Heuristics for known rendering differences that do not fit the other buckets.
// Currently detects: Safari kerning (detected from userAgent), variable fonts,
// and OS-specific rendering (macOS vs Windows).

type BrowserQuirkType = 'safari_kerning' | 'variable_font' | 'os_rendering' | 'none'

function detectBrowserQuirk(sample: MeasurementSample): SubAnalysis {
  const quirk = identifyBrowserQuirk(sample)
  if (quirk === 'none') return noDetection()

  const quirkMessages: Record<BrowserQuirkType, string> = {
    safari_kerning:
      'Safari applies different kerning metrics than Chrome/Firefox. ' +
      'Pretext uses a per-browser tolerance adjustment to account for this.',
    variable_font:
      'Variable font detected via font-variation-settings. ' +
      'canvas.measureText may not honour all variation axes, leading to divergence.',
    os_rendering:
      'OS-specific font rendering detected (macOS vs Windows). ' +
      'system-ui resolves to different optical variants; use a named font instead.',
    none: '',
  }

  return {
    detected: true,
    severity: 'minor',
    confidence: 0.6,
    details: { quirkType: quirk },
    recommendation: quirkMessages[quirk],
  }
}

function identifyBrowserQuirk(sample: MeasurementSample): BrowserQuirkType {
  // Variable font: font string contains 'variation-settings' style property
  if (/variation/i.test(sample.font)) return 'variable_font'

  // system-ui warning — different resolution on macOS vs Windows
  if (/system-ui/i.test(sample.font)) return 'os_rendering'

  // Safari user-agent heuristic (browser environment only)
  if (
    typeof navigator !== 'undefined' &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome/.test(navigator.userAgent)
  ) {
    return 'safari_kerning'
  }

  return 'none'
}

// --- Public classifier ---

export async function classifyDivergence(
  result: MeasurementResult,
  adapter: DOMAdapter,
): Promise<DivergenceAnalysis> {
  // No divergence — return immediately
  if (result.overallSeverity === 'pass') {
    return {
      detected: false,
      severity: 'minor',
      confidence: 1,
      recommendation: 'No divergence detected.',
      details: {},
    }
  }

  const sample = result.sample

  // 1. Font fallback (highest priority, requires async DOM access)
  const fontFallback = await detectFontFallback(sample, adapter)
  if (fontFallback.detected) {
    return buildAnalysis('font_fallback', fontFallback)
  }

  // 2. Bidi shaping
  const bidi = detectBidi(sample)
  if (bidi.detected) return buildAnalysis('bidi_shaping', bidi)

  // 3. Emoji rendering
  const emoji = detectEmoji(sample)
  if (emoji.detected) return buildAnalysis('emoji_rendering', emoji)

  // 4. Browser quirks
  const quirk = detectBrowserQuirk(sample)
  if (quirk.detected) return buildAnalysis('browser_quirk', quirk)

  // 5. Unknown
  return {
    detected: true,
    severity: 'major',
    rootCause: 'unknown',
    confidence: 0.3,
    recommendation:
      'Divergence detected but root cause is unknown. ' +
      'Please report this to the Pretext maintainers with a minimal reproduction.',
    details: { maxDelta: result.maxDelta },
  }
}

function buildAnalysis(rootCause: DivergenceRootCause, sub: SubAnalysis): DivergenceAnalysis {
  return {
    detected: true,
    severity: sub.severity,
    rootCause,
    confidence: sub.confidence,
    recommendation: sub.recommendation,
    details: sub.details,
  }
}

// --- Batch classification helper ---

export async function classifyAll(
  results: MeasurementResult[],
  adapter: DOMAdapter,
): Promise<DivergenceAnalysis[]> {
  const analyses: DivergenceAnalysis[] = []
  for (const result of results) {
    analyses.push(await classifyDivergence(result, adapter))
  }
  return analyses
}

// --- Sync classification (no font-fallback check) ---
//
// Use this when you do not have access to a live DOM (e.g. in unit tests that
// inject fake results).  Font-fallback detection is skipped.

export function classifyDivergenceSync(result: MeasurementResult): DivergenceAnalysis {
  if (result.overallSeverity === 'pass') {
    return {
      detected: false,
      severity: 'minor',
      confidence: 1,
      recommendation: 'No divergence detected.',
      details: {},
    }
  }

  const sample = result.sample

  const bidi = detectBidi(sample)
  if (bidi.detected) return buildAnalysis('bidi_shaping', bidi)

  const emoji = detectEmoji(sample)
  if (emoji.detected) return buildAnalysis('emoji_rendering', emoji)

  const quirk = detectBrowserQuirk(sample)
  if (quirk.detected) return buildAnalysis('browser_quirk', quirk)

  return {
    detected: true,
    severity: 'major',
    rootCause: 'unknown',
    confidence: 0.3,
    recommendation:
      'Divergence detected but root cause is unknown. ' +
      'Please report to the Pretext maintainers with a minimal reproduction.',
    details: { maxDelta: result.maxDelta },
  }
}
