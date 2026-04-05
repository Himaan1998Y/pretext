// Classifies text samples by language category and detects likely root causes
// for measurement divergences.
//
// Language detection uses Unicode block membership without dependencies.
// Root cause detection is heuristic: it uses language, text content, and
// severity to narrow the most plausible explanation.

import type { LanguageCategory, RootCause, Severity } from './types.ts'

// ---------------------------------------------------------------------------
// Unicode ranges (BMP + astral via surrogate check)
// ---------------------------------------------------------------------------

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/u
const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/u
const CJK_RE =
  /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF\u{20000}-\u{2A6DF}]/u
const HIRAGANA_KATAKANA_RE = /[\u3040-\u30FF\u31F0-\u31FF]/u
const HANGUL_RE = /[\uAC00-\uD7FF\u1100-\u11FF]/u
const THAI_RE = /[\u0E00-\u0E7F]/u
const MYANMAR_RE = /[\u1000-\u109F]/u
const KHMER_RE = /[\u1780-\u17FF]/u
const EMOJI_RE = /\p{Emoji_Presentation}/u

/** Detect the dominant language category of a text string. */
export function classifyLanguage(text: string): LanguageCategory {
  if (!text) return 'unknown'

  // Script presence checks (ordered by uniqueness)
  const hasArabic = ARABIC_RE.test(text)
  const hasHebrew = HEBREW_RE.test(text)
  const hasHiraganaKatakana = HIRAGANA_KATAKANA_RE.test(text)
  const hasHangul = HANGUL_RE.test(text)
  const hasCJK = CJK_RE.test(text)
  const hasThai = THAI_RE.test(text)
  const hasMyanmar = MYANMAR_RE.test(text)
  const hasKhmer = KHMER_RE.test(text)

  const scriptCount = [
    hasArabic || hasHebrew,
    hasCJK || hasHiraganaKatakana || hasHangul,
    hasThai,
    hasMyanmar,
    hasKhmer,
  ].filter(Boolean).length

  if (scriptCount > 1) return 'mixed'

  if (hasHiraganaKatakana) return 'japanese'
  if (hasHangul) return 'korean'
  if (hasCJK) {
    // Distinguish Chinese vs Japanese by presence of kana
    return 'chinese'
  }
  if (hasThai) return 'thai'
  if (hasMyanmar) return 'myanmar'
  if (hasKhmer) return 'khmer'

  // Distinguish Arabic vs Hebrew vs Urdu
  if (hasArabic && hasHebrew) return 'mixed'
  if (hasHebrew) return 'hebrew'
  if (hasArabic) {
    // Urdu uses Arabic script but contains specific characters
    const urduSpecific = /[\u06AF\u06BA\u06BE\u06C1\u06C3\u0679\u0688\u0691]/u
    return urduSpecific.test(text) ? 'urdu' : 'arabic'
  }

  return 'english'
}

// ---------------------------------------------------------------------------
// Root cause detection
// ---------------------------------------------------------------------------

type RootCauseResult = {
  rootCause: RootCause
  confidence: number
}

/**
 * Heuristically identify the most likely root cause of a measurement
 * divergence for a given text, language, and severity level.
 */
export function classifyRootCause(
  text: string,
  language: LanguageCategory,
  severity: Severity,
): RootCauseResult {
  // No meaningful divergence: no root cause
  if (severity === 'exact' || severity === 'close') {
    return { rootCause: 'none', confidence: 1.0 }
  }

  // RTL scripts require bidi shaping — high confidence cause of divergence
  if (language === 'arabic' || language === 'urdu' || language === 'hebrew') {
    return { rootCause: 'bidi_shaping', confidence: 0.85 }
  }

  // Emoji correction: canvas inflates emoji at small sizes on macOS/Chrome
  if (EMOJI_RE.test(text)) {
    return { rootCause: 'emoji_correction', confidence: 0.8 }
  }

  // CJK with large delta: often font fallback to a different metric font
  if (
    (language === 'chinese' || language === 'japanese' || language === 'korean') &&
    severity === 'critical'
  ) {
    return { rootCause: 'font_fallback', confidence: 0.7 }
  }

  // Mixed scripts: may have bidi or font fallback at play
  if (language === 'mixed') {
    const hasRTL = ARABIC_RE.test(text) || HEBREW_RE.test(text)
    if (hasRTL) return { rootCause: 'bidi_shaping', confidence: 0.65 }
    return { rootCause: 'font_fallback', confidence: 0.55 }
  }

  // Small Latin divergences often come from browser-specific hinting
  if (severity === 'warning') {
    return { rootCause: 'browser_quirk', confidence: 0.6 }
  }

  return { rootCause: 'unknown', confidence: 0.4 }
}

/** Check whether a language category uses RTL script. */
export function isRTL(language: LanguageCategory): boolean {
  return language === 'arabic' || language === 'hebrew' || language === 'urdu'
}
