// Root cause classifier for measurement divergences.
// Produces structured analysis with a human-readable suggestion per result.

import type {
  DivergenceAnalysis,
  DivergenceReason,
  LanguageBreakdown,
  MeasurementResult,
  ValidationSummary,
} from './types.js'

const REASON_DETAILS: Record<DivergenceReason, string> = {
  font_fallback:
    'Canvas and DOM resolved different font families, causing metric differences.',
  bidi_reorder:
    'Bidirectional text reordering in the DOM shifted glyph positions.',
  emoji_width:
    'Emoji glyph widths differ between the canvas font and the DOM layout engine.',
  browser_quirk:
    'Browser-specific line-break or whitespace behaviour differs from canvas.',
  tab_width:
    'Tab stop width differs between canvas tabSize setting and DOM tab-size.',
  soft_hyphen:
    'Soft hyphen insertion changed the effective line count in the DOM.',
  line_break_policy:
    'CJK or non-Latin line-break policy differs between canvas and DOM.',
  whitespace_collapse:
    'Whitespace collapsing rules produced a different line count in the DOM.',
  unknown: 'No specific root cause was identified.',
}

const REASON_SUGGESTIONS: Record<DivergenceReason, string> = {
  font_fallback:
    'Ensure the same font stack is loaded in both canvas context and DOM container.',
  bidi_reorder:
    'Use the bidi-aware pretext path (prepareWithSegments) and validate with an RTL container.',
  emoji_width:
    'Enable the emoji-correction path via measurementOptions.emojiCorrection = true.',
  browser_quirk:
    'Check browser-specific CSS properties (overflow-wrap, word-break) match your canvas assumptions.',
  tab_width:
    'Set canvas context tabSize to match the CSS tab-size of the DOM container.',
  soft_hyphen:
    'Ensure soft-hyphen positions are computed via the softHyphen-aware layout path.',
  line_break_policy:
    'Use wordBreak: keep-all for CJK if the DOM container also uses keep-all.',
  whitespace_collapse:
    'Ensure canvas whitespace handling matches the CSS white-space property.',
  unknown:
    'Compare canvas metrics and DOM bounding rects directly with the diagnostic page.',
}

export function analyzeDivergence(
  result: MeasurementResult
): DivergenceAnalysis {
  return {
    result,
    details: REASON_DETAILS[result.reason],
    suggestion: REASON_SUGGESTIONS[result.reason],
  }
}

export function analyzeAll(results: MeasurementResult[]): DivergenceAnalysis[] {
  return results
    .filter((r) => r.diverged)
    .map((r) => analyzeDivergence(r))
}

export function buildLanguageBreakdown(
  results: MeasurementResult[]
): LanguageBreakdown[] {
  const map = new Map<
    string,
    { total: number; passed: number; warnings: number; criticals: number; totalPixels: number }
  >()

  for (const r of results) {
    let entry = map.get(r.language)
    if (!entry) {
      entry = { total: 0, passed: 0, warnings: 0, criticals: 0, totalPixels: 0 }
      map.set(r.language, entry)
    }
    entry.total++
    entry.totalPixels += r.divergencePixels
    if (r.severity === 'pass') entry.passed++
    else if (r.severity === 'warning') entry.warnings++
    else entry.criticals++
  }

  return Array.from(map.entries()).map(([language, e]) => ({
    language,
    total: e.total,
    passed: e.passed,
    warnings: e.warnings,
    criticals: e.criticals,
    passRate: e.total > 0 ? e.passed / e.total : 1,
    avgDivergencePixels: e.total > 0 ? e.totalPixels / e.total : 0,
  }))
}

export function buildSummary(
  results: MeasurementResult[],
  durationMs: number
): ValidationSummary {
  let passed = 0, warnings = 0, criticals = 0
  for (const r of results) {
    if (r.severity === 'pass') passed++
    else if (r.severity === 'warning') warnings++
    else criticals++
  }
  const total = results.length
  return {
    total,
    passed,
    warnings,
    criticals,
    passRate: total > 0 ? passed / total : 1,
    byLanguage: buildLanguageBreakdown(results),
    durationMs,
    timestamp: Date.now(),
  }
}
