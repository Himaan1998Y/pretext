# Measurement Validator

A module for detecting and analyzing divergence between canvas (Pretext) and DOM text measurements.

## Getting Started

```typescript
import {
  MeasurementComparator,
  classifyDivergence,
  generateConsoleSummary,
} from './src/measurement-validator/index.ts'

const comparator = new MeasurementComparator()

const sample = {
  text: 'Hello world',
  font: '16px Arial',
  maxWidth: 400,
  lineHeight: 20,
}

// Run Pretext layout
import { prepare, layoutWithLines } from '@chenglou/pretext'
const prepared = prepare(sample.text, sample.font)
const pretextLayout = layoutWithLines(prepared, sample.maxWidth, sample.lineHeight)

// Compare with DOM
const result = await comparator.compare(sample, pretextLayout)
console.log(result.overallSeverity) // 'pass' | 'warning' | 'error' | 'critical'

// Classify divergence root cause
const analysis = await classifyDivergence(result, sample)
console.log(analysis.rootCause) // 'font_fallback' | 'bidi_shaping' | 'emoji_rendering' | ...

// Generate human-readable summary
console.log(generateConsoleSummary([result]))
```

## API Reference

### `MeasurementComparator`

Compares Pretext layout output against live DOM measurements.

```typescript
class MeasurementComparator {
  async compare(
    sample: MeasurementSample,
    pretextLayout: PretextLayoutResult,
  ): Promise<MeasurementResult>
}
```

### `measureDOMText(sample)`

Measures text layout using the browser DOM.

```typescript
async function measureDOMText(sample: MeasurementSample): Promise<DOMTextMetrics>
```

### `classifyDivergence(result, sample)`

Identifies the root cause of measurement divergence.

```typescript
async function classifyDivergence(
  result: MeasurementResult,
  sample: MeasurementSample,
): Promise<DivergenceAnalysis>
```

### `generateJSONReport(results)`

Serializes results to a JSON string.

### `generateConsoleSummary(results)`

Returns a human-readable pass/warning/error/critical summary.

### `generateDetailedReport(results)`

Returns a detailed per-line breakdown.

### `generateLanguageBreakdown(results)`

Returns a count of results by severity.

## Types

```typescript
interface MeasurementSample {
  text: string
  font: string
  maxWidth: number
  lineHeight?: number
  whiteSpace?: 'normal' | 'pre-wrap'
}

interface MeasurementResult {
  sample: MeasurementSample
  lines: LineComparison[]
  totalLines: number
  exactMatches: number
  minorDelta: number
  majorDelta: number
  criticalDelta: number
  overallSeverity: 'pass' | 'warning' | 'error' | 'critical'
  timestamp: string
  executionTimeMs: number
}

interface DivergenceAnalysis {
  detected: boolean
  severity: 'minor' | 'major' | 'critical'
  rootCause?: 'font_fallback' | 'bidi_shaping' | 'emoji_rendering' | 'browser_quirk' | 'variable_font' | 'unknown'
  confidence: number
  recommendation: string
  details: Record<string, unknown>
}
```

## Severity Thresholds

| Severity | Delta (px) |
|----------|-----------|
| exact    | < 0.1     |
| minor    | 0.1–0.5   |
| major    | 0.5–2.0   |
| critical | ≥ 2.0     |
