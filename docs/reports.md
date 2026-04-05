# Measurement Validator Reports

The measurement validator compares pretext canvas-based width predictions against actual DOM measurements and generates structured reports in multiple formats.

## Quick Start

```bash
# Run validation and print console summary
bun run validator

# Generate an HTML report
bun run validator:html

# Export CSV for spreadsheet analysis
bun run validator:csv

# Validate only RTL corpus and export Markdown
bun run scripts/cli.ts validate --corpus=rtl --report=markdown --output=rtl-report.md
```

---

## Report Formats

### Console (default)

A colour-coded summary with pass rates and per-language breakdown. Ideal for CI logs.

```
Measurement Validator — Summary
────────────────────────────────────────
  Total samples : 12
  Pass rate     : 83.3%
  Exact         : 6
  Close         : 4
  Warning       : 1
  Error         : 1
  Critical      : 0

  By language:
    english      100.0% (5/5, avg Δ 0.42px)
    arabic        60.0% (3/5, avg Δ 9.80px)
    chinese      100.0% (2/2, avg Δ 0.50px)
```

Add `--verbose` to see per-sample result lines:

```
  ✅ [en-01] Hello world                      Δ=-0.30px (exact)
  ⚠️  [en-03] Typography matters               Δ=3.50px (warning)
  ❌ [ar-01] مرحبا بالعالم                    Δ=-8.00px (error)
```

### HTML Report

Self-contained HTML file with no external dependencies.

**Features:**
- Summary statistics cards (total, pass rate, exact/close/warning/error/critical)
- Filterable results table by severity, language, and font
- Client-side column sorting
- Print-friendly CSS
- Loads in < 2 seconds for 1000+ samples

```bash
bun run scripts/cli.ts validate --report=html --output=report.html
```

Open `report.html` in any browser — no server required.

### CSV (Excel/Google Sheets/LibreOffice)

UTF-8 BOM-encoded CSV that opens correctly in Excel without encoding issues.

**Columns:** `ID, Text, Font, FontSize, ContainerWidth, PretextWidth, DOMWidth, Delta, DeltaPercent, Severity, Language, RootCause, Confidence, Timestamp`

```bash
bun run scripts/cli.ts validate --report=csv --output=results.csv
```

**Excel tip:** Double-click the file, or use _Data → From Text/CSV_ with UTF-8 encoding selected.

### Markdown

GitHub-flavored Markdown ready to paste into issues, PR descriptions, or documentation.

```bash
bun run scripts/cli.ts validate --report=markdown --output=report.md
```

Output structure:
1. `# Measurement Validator Report` heading with generation timestamp
2. `## Summary` table with emoji indicators
3. `### Language (N samples)` subsection per language, sorted worst-first

### JSON

Complete machine-readable document with metadata, summary statistics, and all results.

```bash
bun run scripts/cli.ts validate --report=json --output=results.json
```

Schema:
```json
{
  "metadata": {
    "version": "1.0.0",
    "generatedAt": "2024-06-15T12:00:00.000Z",
    "totalSamples": 12,
    "tool": "@chenglou/pretext measurement-validator"
  },
  "summary": {
    "total": 12,
    "exact": 6,
    "close": 4,
    "warning": 1,
    "error": 1,
    "critical": 0,
    "passRate": 83.33,
    "byLanguage": {
      "english": { "total": 5, "passing": 5, "passRate": 100, "avgDelta": 0.42 }
    }
  },
  "results": [ ... ]
}
```

---

## Filtering

All output commands support filtering before report generation.

### By language

```bash
# Only Arabic results
bun run scripts/cli.ts validate --language=arabic

# Only Japanese results
bun run scripts/cli.ts validate --language=japanese --report=html --output=ja.html
```

Supported language values: `english`, `arabic`, `hebrew`, `urdu`, `chinese`, `japanese`, `korean`, `thai`, `myanmar`, `khmer`, `mixed`, `unknown`

### By severity

```bash
# Only results at warning level or worse
bun run scripts/cli.ts validate --severity=warning

# Only errors and criticals
bun run scripts/cli.ts validate --severity=error --report=markdown
```

Severity levels (in order): `exact` → `close` → `warning` → `error` → `critical`

Filtering by `warning` returns `warning`, `error`, and `critical` results.

---

## Programmatic API

### ReportFormatter

The `ReportFormatter` class provides a chainable API for filtering and exporting.

```typescript
import { ReportFormatter } from '@chenglou/pretext/measurement-validator'
import type { ValidationResult } from '@chenglou/pretext/measurement-validator'

// ... obtain results from your validation run
const results: ValidationResult[] = /* ... */

const formatter = new ReportFormatter(results)

// Filter and sort
const filtered = formatter
  .filterByLanguage('arabic')
  .filterBySeverity('warning')
  .sortByDelta()          // worst delta first (default)

// Get summary statistics
const stats = filtered.summary()
console.log(`Arabic pass rate: ${stats.passRate.toFixed(1)}%`)

// Generate reports
const html = filtered.toHTML()
const csv  = filtered.toCSV()
const md   = filtered.toMarkdown()
const json = filtered.toJSON()
const text = filtered.toConsole(/* useColor */ true)
```

### Individual exporters

Each exporter can also be used directly:

```typescript
import { exportCSV }      from '@chenglou/pretext/measurement-validator'
import { exportMarkdown } from '@chenglou/pretext/measurement-validator'
import { exportJSON }     from '@chenglou/pretext/measurement-validator'
import { generateHTMLReport } from '@chenglou/pretext/measurement-validator'
import { writeFileSync } from 'node:fs'

writeFileSync('out.csv',  exportCSV(results))
writeFileSync('out.md',   exportMarkdown(results))
writeFileSync('out.json', exportJSON(results))
writeFileSync('out.html', generateHTMLReport(results))
```

### Transform existing results

```bash
# Re-format a stored JSON file as HTML
bun run scripts/cli.ts report --input=results.json --report=html --output=report.html

# Filter existing results and export Markdown
bun run scripts/cli.ts report --input=results.json --language=arabic --report=markdown
```

---

## Corpus Options

The `--corpus` flag selects which built-in fixture set to validate:

| Value     | Description                                 |
|-----------|---------------------------------------------|
| `all`     | All built-in samples (default)              |
| `english` | Latin / LTR English text                    |
| `rtl`     | Arabic, Hebrew, Urdu (RTL bidi scripts)     |
| `cjk`     | Chinese, Japanese, Korean                   |
| `complex` | Thai, Myanmar, Khmer                        |
| `mixed`   | Mixed script (LTR + RTL in the same string) |

```bash
bun run scripts/cli.ts validate --corpus=cjk --report=html --output=cjk.html
```

---

## Severity Thresholds

| Level      | Absolute delta | Meaning                             |
|------------|----------------|-------------------------------------|
| `exact`    | ≤ 0.5 px       | Sub-pixel rounding noise — passing  |
| `close`    | ≤ 2.0 px       | Minor hinting variation — passing   |
| `warning`  | ≤ 5.0 px       | Noticeable but not layout-breaking  |
| `error`    | ≤ 15.0 px      | Layout impact, investigate          |
| `critical` | > 15.0 px      | Significant divergence              |

Exit codes: `0` = all passing, `1` = warnings only, `2` = errors or criticals.
