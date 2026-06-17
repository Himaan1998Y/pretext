# Measurement Validator

Validates Pretext canvas-based text measurements against actual browser DOM
rendering, surfaces per-line divergences, and classifies root causes.

## Background

Pretext uses `canvas.measureText` to measure text without forcing DOM reflow.
While this is fast, subtle differences between canvas and DOM rendering can
appear due to:

- **Font fallback** — the requested font isn't loaded; canvas and DOM each
  pick different system fallbacks.
- **Emoji correction** — Chrome/Firefox canvas measures emoji wider than DOM at
  small font sizes; Pretext auto-corrects, but the correction may over- or
  under-compensate.
- **Browser kerning differences** — Safari applies kerning that differs from
  other browsers.
- **Bidi/RTL shaping** — complex Arabic or Hebrew shaping can change effective
  glyph widths compared to the simple sum the canvas reports.

The Measurement Validator runs both pipelines on the same input and reports
exactly how large those differences are.

## Quick Start

```typescript
import { compare, buildReport, printReport } from '@chenglou/pretext/measurement-validator'

// Compare a single sample (requires browser environment)
const result = await compare({
  text: 'The quick brown fox jumps over the lazy dog.',
  font: '16px Arial',
  maxWidth: 300,
  lineHeight: 20,
})

console.log(result.metrics.severity) // 'exact' | 'minor' | 'major' | 'critical'
console.log(result.metrics.maxLineDelta) // e.g. 0.042

// Build and print a human-readable report
const report = buildReport([result])
printReport(report)
```

## API Reference

### `compare(sample: MeasurementSample): Promise<ComparisonResult>`

Compare Pretext against DOM for a single sample. **Requires a browser
environment** — `document` must be available.

### `compareAll(samples: MeasurementSample[]): Promise<ComparisonResult[]>`

Run `compare` over an array of samples sequentially and return all results.

### `measureDOM(sample: MeasurementSample): Promise<DOMMeasurement>`

Low-level DOM measurement. Creates a hidden container, waits for fonts, then
uses the Range API to extract per-line widths.

### `buildReport(results: ComparisonResult[]): ValidationReport`

Aggregate comparison results into a structured report with summary counts and
pass rate.

### `printReport(report: ValidationReport): void`

Print a human-readable summary to `console.log`.

### `toJSON(report: ValidationReport, pretty?: boolean): string`

Serialize a report to JSON.

### `toConsoleText(report: ValidationReport): string`

Return the console summary as a plain string (useful for CI logs).

### `classifySeverity(delta: number): Severity`

Classify an absolute pixel delta into one of four buckets:

| Severity | Delta |
|----------|-------|
| `exact`    | < 0.1 px |
| `minor`    | 0.1–0.5 px |
| `major`    | 0.5–2.0 px |
| `critical` | ≥ 2.0 px |

## Types

```typescript
type MeasurementSample = {
  text: string
  font: string
  maxWidth?: number       // default 300
  lineHeight?: number     // default 1.2 × font-size
  whiteSpace?: 'normal' | 'pre-wrap'  // default 'normal'
  wordBreak?: 'normal' | 'keep-all'   // default 'normal'
  direction?: 'ltr' | 'rtl'          // default 'ltr'
  label?: string
}

type ComparisonResult = {
  sample: MeasurementSample
  metrics: DivergenceMetrics
  lines: LineComparison[]
  rootCause?: string
  timestamp: string
  userAgent: string
}

type DivergenceMetrics = {
  lineCountMatch: boolean
  pretextLineCount: number
  domLineCount: number
  maxLineDelta: number
  averageDelta: number
  severity: Severity
}

type LineComparison = {
  lineNumber: number
  text: string
  pretextWidth: number
  domWidth: number
  delta: number
  relativeError: number
  severity: Severity
}
```

## Running the Test Suite

The unit tests for the validator live in `test/measurement-validator.test.ts`
and can be run with:

```sh
bun test test/measurement-validator.test.ts
```

The full suite (including all invariant tests) runs with:

```sh
bun test
```

## Test Fixtures

`test/fixtures/english-samples.json` contains 10 English-language samples
covering a range of font sizes, container widths, wrapping scenarios, and
`pre-wrap` mode.  These are used by the accuracy browser pages to validate
Phase 1 coverage.

## Limitations (Phase 1)

- **Browser-only** — DOM measurement requires `document` and `document.fonts`.
- **English-first** — Phase 1 focuses on LTR English text; RTL and CJK scripts
  are tracked in Phase 2.
- **No per-glyph shaping** — measurement is line-level; sub-pixel kerning
  variations between canvas and DOM are expected for some fonts.
- **JSDOM** — because JSDOM has no real layout engine, line widths extracted
  in a JSDOM environment will be zero/unreliable.  Run in a real browser or
  Playwright for meaningful results.

## Severity Thresholds

| Level    | Max delta | Interpretation |
|----------|-----------|----------------|
| exact    | < 0.1 px  | Within sub-pixel rounding tolerance |
| minor    | 0.1–0.5 px | Acceptable for most uses; investigate for tight layouts |
| major    | 0.5–2.0 px | Visible in dense text; root cause should be identified |
| critical | ≥ 2.0 px  | Likely a font or shaping issue; line breaks will diverge |
