# Classifier Guide

The classifier module (`src/measurement-validator/classifier.ts`) analyses a `MeasurementResult` and returns a `DivergenceAnalysis` that identifies the most likely root cause.

## Root Causes

| Root Cause      | Description |
|-----------------|-------------|
| `font_fallback` | The requested font is not loaded; the browser fell back to a generic serif/sans-serif |
| `bidi_shaping`  | RTL text causes different shaping between canvas and DOM |
| `emoji_rendering` | Emoji glyphs have browser-specific widths |
| `browser_quirk` | Known browser-specific kerning/spacing differences |
| `unknown`       | Divergence detected but cause could not be classified |

## Usage

```typescript
import { classifyDivergence } from './src/measurement-validator/classifier.ts'

const analysis = await classifyDivergence(result, sample)

if (analysis.detected) {
  console.log(`Root cause: ${analysis.rootCause}`)
  console.log(`Confidence: ${(analysis.confidence * 100).toFixed(0)}%`)
  console.log(`Recommendation: ${analysis.recommendation}`)
}
```

## Individual Detectors

### `detectBidi(sample)`

Checks whether the sample contains RTL characters (Arabic, Hebrew, and related Unicode ranges). Returns `{ detected, severity, confidence }`.

```typescript
import { detectBidi } from './src/measurement-validator/classifier.ts'

const result = detectBidi({ text: 'مرحبا', font: '16px Arial', maxWidth: 400 })
// { detected: true, severity: 'major', confidence: 0.9 }
```

### `detectEmoji(sample)`

Checks for emoji presentation characters using Unicode property escapes. Returns `{ detected, severity, confidence, emojiCount }`.

```typescript
import { detectEmoji } from './src/measurement-validator/classifier.ts'

const result = detectEmoji({ text: 'Hello 😀', font: '16px Arial', maxWidth: 400 })
// { detected: true, severity: 'major', confidence: 0.85, emojiCount: 1 }
```

### `detectBrowserQuirk(sample)`

Checks the current browser's User Agent for known quirky rendering behaviours (e.g., Safari-specific kerning).

```typescript
import { detectBrowserQuirk } from './src/measurement-validator/classifier.ts'

const result = detectBrowserQuirk(sample)
// { detected: false, severity: 'minor', confidence: 0, recommendation: '' }
```

### `detectFontFallback(sample)`

Compares measurements using the specified font against the `serif` fallback. If the widths are similar, font fallback is likely.

```typescript
import { detectFontFallback } from './src/measurement-validator/classifier.ts'

const result = await detectFontFallback(sample)
// { detected: false, severity: 'minor' }
```

## Classification Priority

`classifyDivergence` tests causes in priority order:

1. Font fallback (highest impact)
2. Bidi shaping
3. Emoji rendering
4. Browser quirks
5. Unknown (fallback)

The first matching cause is returned, so a sample with both RTL text and emoji would be classified as `bidi_shaping`.
