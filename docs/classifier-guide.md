# Divergence Classifier Guide

The divergence classifier (`src/measurement-validator/classifier.ts`) identifies
**why** Pretext canvas measurements diverge from DOM measurements. It runs a
priority-ordered chain of detection strategies and returns a `DivergenceAnalysis`.

## Quick Start

```typescript
import {
  createComparator,
  createDOMAdapter,
  classifyDivergence,
  classifyDivergenceSync,
} from './src/measurement-validator/index.js'

const adapter = createDOMAdapter()
const comparator = createComparator(adapter)

const result = comparator.compare({
  text: 'مرحباً بالعالم',
  font: '16px Arial',
  maxWidth: 300,
  lineHeight: 20,
})

// Async (includes font-fallback detection via DOM)
const analysis = await classifyDivergence(result, adapter)
console.log(analysis.rootCause)    // 'bidi_shaping'
console.log(analysis.confidence)   // 0.85
console.log(analysis.recommendation)
```

## `DivergenceAnalysis` shape

```typescript
type DivergenceAnalysis = {
  detected: boolean
  severity: 'minor' | 'major' | 'critical'
  rootCause?:
    | 'font_fallback'
    | 'bidi_shaping'
    | 'emoji_rendering'
    | 'browser_quirk'
    | 'variable_font'
    | 'unknown'
  confidence: number   // 0–1
  recommendation: string
  details: Record<string, unknown>
}
```

## Detection Strategies

The classifier tests strategies in priority order. The **first** matching strategy
wins and determines the `rootCause`.

### 1. Font Fallback (`font_fallback`) — async only

**When:** The requested font is not loaded and the browser silently falls back to
a system font.

**How:** Re-measures with the `serif` fallback; if the total line widths are
within 1 % of the specified-font widths, the font was likely never loaded.

**Confidence:** 0.90

**Fix:** Preload fonts with `<link rel="preload">` or use a guaranteed system font.

---

### 2. Bidi Shaping (`bidi_shaping`)

**When:** The text contains Arabic, Hebrew, Urdu, or other RTL characters
(`U+0590–U+08FF`, `U+FB1D–U+FDFF`, `U+FE70–U+FEFF`).

**How:** Regexp check on the text string; no DOM access required.

**Confidence:** 0.85

**Fix:** Verify that `PreparedTextWithSegments.segLevels` are populated and used
for RTL rendering; check that `canvas.measureText` and DOM agree on shaped glyphs.

---

### 3. Emoji Rendering (`emoji_rendering`)

**When:** The text contains one or more emoji presentation codepoints
(`\p{Emoji_Presentation}`).

**How:** Unicode regex check; no DOM access required.

**Confidence:** 0.75

**Note:** Pretext auto-corrects Chrome/Firefox canvas emoji metrics at small font
sizes; Safari canvas and DOM agree natively. Divergence here usually means a
font-size-specific correction is off.

**Fix:** Test emoji-heavy strings across Chrome, Firefox, and Safari independently.

---

### 4. Browser Quirk (`browser_quirk`)

**When:** Heuristics suggest a known browser/OS rendering difference:
- `system-ui` in the font string → `os_rendering` (macOS vs Windows resolution)
- `variation` in the font string → `variable_font` (canvas axis support)
- Safari user-agent detected → `safari_kerning`

**Confidence:** 0.60

**Fix:** Use named fonts instead of `system-ui`; test variable fonts manually.

---

### 5. Unknown (`unknown`)

**When:** A divergence exists but none of the above strategies fired.

**Confidence:** 0.30

**Action:** File a bug with a minimal reproduction — text string, font, width, and
the two measurements.

---

## Sync vs Async

| Function | Font-fallback | Use when |
|---|---|---|
| `classifyDivergence(result, adapter)` | ✅ async DOM | Production validation |
| `classifyDivergenceSync(result)` | ❌ skipped | Unit tests, scripts without live DOM |

---

## Batch Classification

```typescript
import { classifyAll } from './src/measurement-validator/index.js'

const analyses = await classifyAll(results, adapter)
```

---

## Interpreting Confidence

| Confidence | Interpretation |
|---|---|
| ≥ 0.90 | Very likely the root cause |
| 0.75–0.89 | Probable cause, worth investigating |
| 0.60–0.74 | Possible cause, check manually |
| < 0.60 | Speculative — use as a starting point |

---

## Examples

### Font not loaded

```typescript
const analysis = await classifyDivergence(result, adapter)
// {
//   detected: true,
//   rootCause: 'font_fallback',
//   severity: 'critical',
//   confidence: 0.90,
//   recommendation: 'Font "16px Roboto" may not be loaded ...',
//   details: { fontSpecified: '16px Roboto', fontDetected: 'serif (system fallback)' }
// }
```

### RTL text

```typescript
// sample.text = 'مرحباً بالعالم'
// {
//   detected: true,
//   rootCause: 'bidi_shaping',
//   severity: 'major',
//   confidence: 0.85,
//   recommendation: 'RTL text detected ...',
//   details: { hasRTL: true, isMixedBidi: false }
// }
```

### No divergence

```typescript
// result.overallSeverity === 'pass'
// {
//   detected: false,
//   severity: 'minor',
//   confidence: 1,
//   recommendation: 'No divergence detected.',
//   details: {}
// }
```
