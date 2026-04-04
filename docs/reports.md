# Report Generation Guide

## Overview

The measurement validator can generate reports in multiple formats from
validation results.  Use the CLI to validate a corpus and export the output
in the format that fits your workflow.

## CLI Usage

### Basic validation (console output)

```bash
bun run scripts/cli.ts validate
```

### Generate CSV report

```bash
bun run validator validate --report=csv --output=results.csv
```

### Generate HTML report

```bash
bun run validator validate --report=html --output=report.html
```

### Filter by language

```bash
bun run validator validate --language=ar --report=markdown
```

### Filter by severity

```bash
bun run validator validate --severity=critical --report=json
```

## Report Formats

### CSV

- Excel-compatible (UTF-8 with BOM by default)
- Tab-delimited option available (`--separator=\t`)
- Quotes and newlines inside fields are correctly escaped
- Includes: Sample, Text, Font, MaxWidth, PretextWidth, DOMWidth, Delta,
  ErrorPercent, Severity, RootCause, Confidence, Language, Timestamp

### Markdown

- GitHub Flavored Markdown
- Copy-pasteable to issues and pull requests
- Grouped by language (default) or flat
- Severity summary at the top with emoji indicators

### HTML

- Self-contained single file — no external dependencies
- In-page filter controls (language, severity)
- Summary statistics cards
- By-language breakdown table
- Print-friendly styling

### JSON

- Machine-readable
- Complete data, all fields preserved
- Pipe to `jq` or other tools

## Examples

### Export all measurements as CSV

```bash
bun run validator validate --corpus=all --report=csv --output=all.csv
```

### Get summary of RTL divergences

```bash
bun run validator validate --language=ar --severity=error --report=markdown
```

### Analyze CJK measurements

```bash
bun run validator validate --language=zh,ja,ko --report=html --output=cjk.html
```

## Programmatic Usage

```typescript
import {
  ReportFormatter,
  type MeasurementResult,
} from './src/measurement-validator/index.ts'

const results: MeasurementResult[] = [] // from your validation run

const formatter = new ReportFormatter(results)

// Generate different formats
const csv  = formatter.toCSV({ encoding: 'utf-8-bom' })
const md   = formatter.toMarkdown({ groupByLanguage: true })
const html = formatter.toHTML({ includeCharts: false })
const json = formatter.toJSON()

// Apply filters before formatting
const arabicWarnings = formatter
  .filterByLanguage('ar')
  .filterBySeverity('warning')
  .toMarkdown()
```
