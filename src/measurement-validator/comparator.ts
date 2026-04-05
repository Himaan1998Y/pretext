// Computes severity and delta metrics from a raw pretext vs DOM width pair.
//
// Thresholds are chosen to reflect typical browser rendering tolerances:
//   exact    – ≤ 0.5 px  (sub-pixel rounding noise)
//   close    – ≤ 2 px    (minor font-hinting variation)
//   warning  – ≤ 5 px    (noticeable but not layout-breaking)
//   error    – ≤ 15 px   (layout impact, worth investigating)
//   critical – > 15 px   (significant layout divergence)

import type {
  LanguageCategory,
  MeasurementPair,
  RootCause,
  Severity,
  ValidationResult,
} from './types.ts'
import { classifyLanguage, classifyRootCause } from './classifier.ts'

const EXACT_THRESHOLD = 0.5
const CLOSE_THRESHOLD = 2.0
const WARNING_THRESHOLD = 5.0
const ERROR_THRESHOLD = 15.0

/** Map an absolute pixel delta to a severity level. */
export function deltaSeverity(delta: number): Severity {
  const abs = Math.abs(delta)
  if (abs <= EXACT_THRESHOLD) return 'exact'
  if (abs <= CLOSE_THRESHOLD) return 'close'
  if (abs <= WARNING_THRESHOLD) return 'warning'
  if (abs <= ERROR_THRESHOLD) return 'error'
  return 'critical'
}

/**
 * Produce a fully-classified ValidationResult from a raw measurement pair.
 *
 * @param pair      - The pretext vs DOM width pair.
 * @param timestamp - ISO timestamp string; defaults to now.
 */
export function compareWidths(
  pair: MeasurementPair,
  timestamp: string = new Date().toISOString(),
): ValidationResult {
  const { sample, pretextWidth, domWidth } = pair
  const delta = pretextWidth - domWidth
  const deltaPercent = domWidth === 0 ? 0 : (Math.abs(delta) / domWidth) * 100
  const severity = deltaSeverity(delta)
  const language: LanguageCategory = sample.language ?? classifyLanguage(sample.text)
  const { rootCause, confidence } = classifyRootCause(sample.text, language, severity)

  return {
    id: sample.id,
    text: sample.text,
    font: sample.font,
    fontSize: sample.fontSize,
    containerWidth: sample.containerWidth,
    pretextWidth,
    domWidth,
    delta,
    deltaPercent,
    severity,
    language,
    rootCause,
    confidence,
    timestamp,
  }
}

/** Determine whether a severity is considered passing (no layout impact). */
export function isPassing(severity: Severity): boolean {
  return severity === 'exact' || severity === 'close'
}

/** Human-readable severity label with emoji indicator. */
export function formatSeverity(severity: Severity): string {
  switch (severity) {
    case 'exact':
      return '✅ exact'
    case 'close':
      return '✅ close'
    case 'warning':
      return '⚠️  warning'
    case 'error':
      return '❌ error'
    case 'critical':
      return '🔴 critical'
  }
}

/** Human-readable root cause label. */
export function formatRootCause(rootCause: RootCause): string {
  switch (rootCause) {
    case 'none':
      return '—'
    case 'font_fallback':
      return 'font fallback'
    case 'bidi_shaping':
      return 'bidi shaping'
    case 'emoji_correction':
      return 'emoji correction'
    case 'browser_quirk':
      return 'browser quirk'
    case 'unknown':
      return 'unknown'
  }
}
