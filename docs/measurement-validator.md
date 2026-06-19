# Measurement Validator

Validates that Pretext's canvas-based text measurements match DOM measurements.

## Overview

Pretext uses `canvas.measureText` for fast, reflow-free text layout. The measurement
validator compares Pretext's line widths and counts against the browser's native DOM
rendering (via the `Range` API) to detect and surface divergences.

## Installation

The measurement validator lives inside the Pretext repository as a sub-package:

```
src/measurement-validator/
├── types.ts            — Core interfaces
├── dom-adapter.ts      — DOM Range-API measurement
├── comparator.ts       — Pretext vs DOM comparison engine
├── report-generator.ts — JSON + console output
├── classifier.ts       — Divergence root-cause detection (Phase 2)
├── test-suite.ts       — Multi-language test runner (Phase 2)
└── index.ts            — Public API
```

## Quick Start

```typescript
import {
  createDOMAdapter,
  createComparator,
  formatResultConsole,
} from './src/measurement-validator/index.js'

// 1. Create a DOM adapter (requires a browser environment)
const adapter = createDOMAdapter()

// 2. Create a comparator backed by the adapter
const comparator = createComparator(adapter)

// 3. Compare a sample
const result = comparator.compare({
  text: 'The quick brown fox jumps over the lazy dog.',
  font: '16px Arial',
  maxWidth: 400,
  lineHeight: 20,
})

// 4. Print a human-readable summary
console.log(formatResultConsole(result))

// 5. Clean up
comparator.dispose()
```

## API Reference

### `MeasurementSample`

Input descriptor for a single comparison:

```typescript
type MeasurementSample = {
  text: string        // Text to measure
  font: string        // CSS font, e.g. '16px Arial'
  maxWidth: number    // Container width (px)
  lineHeight: number  // Line height (px)
  language?: string   // BCP 47 tag, e.g. 'en', 'ar', 'zh-Hans'
  wordBreak?: 'normal' | 'keep-all'
  whiteSpace?: 'normal' | 'pre-wrap'
}
```

### `MeasurementResult`

Output of a single comparison:

```typescript
type MeasurementResult = {
  sample: MeasurementSample
  pretextLineCount: number
  domLineCount: number
  lineCountMatch: boolean
  lines: MeasurementLinePair[]
  overallSeverity: 'pass' | 'minor' | 'major' | 'critical'
  passRate: number       // 0-1
  maxDelta: number       // largest |delta| in px
  durationMs: number
}
```

### `compareMeasurements(sample, domLines, options?)`

Core comparison function. Does not require a DOM adapter — inject pre-measured
`DOMLineMetrics[]` directly (useful for testing and scripts that measure separately).

```typescript
import { compareMeasurements } from './src/measurement-validator/comparator.js'
const result = compareMeasurements(sample, myDOMLines)
```

### `createComparator(adapter)`

Creates a stateful comparator that manages a shared DOM adapter:

```typescript
const comparator = createComparator(adapter)
const result = comparator.compare(sample)
comparator.dispose() // removes DOM elements
```

### `createDOMAdapter()`

Returns an `DOMAdapter` that measures text via the browser Range API.
Must be called in a browser (or jsdom) environment.

### Tolerance

Default tolerance thresholds (`DEFAULT_TOLERANCE`):

| Severity | Condition |
|----------|-----------|
| `pass`     | `|delta| ≤ 0.5px` |
| `minor`    | `0.5px < |delta| ≤ 1.0px` |
| `major`    | `1.0px < |delta| ≤ 2.0px` |
| `critical` | `|delta| > 2.0px` |

Pass a custom `ToleranceConfig` to override:

```typescript
comparator.compare(sample, {
  tolerance: { passDelta: 1.0, minorDelta: 2.0, majorDelta: 4.0 },
})
```

## Report Formats

### Console (human-readable)

```typescript
import { formatResultConsole } from './src/measurement-validator/report-generator.js'
console.log(formatResultConsole(result))
// ✅ PASS — "Hello, world!"
//    font=16px Arial width=400px  passRate=100.0%  maxDelta=0.000px  1ms
```

### JSON (machine-readable)

```typescript
import { formatResultJSON } from './src/measurement-validator/report-generator.js'
const json = formatResultJSON(result) // full MeasurementResult as JSON
```

## Known Limitations

- Requires a real browser environment (or a DOM emulator like `jsdom`).
- `system-ui` font may resolve differently in canvas vs DOM on macOS — use named fonts.
- Complex script line-breaking (Thai, Myanmar, Khmer) depends on browser ICU data.
- Variable fonts are not fully supported by `canvas.measureText` in all browsers.

## Phase 2: Divergence Classifier

See [classifier-guide.md](./classifier-guide.md) for root-cause detection.

## Language Support

See [language-matrix.md](./language-matrix.md) for per-language test coverage and known issues.
