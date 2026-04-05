# CLI Reference

Complete reference for the `scripts/cli.ts` measurement-validator command-line tool.

## Running the CLI

```bash
# Via npm scripts
npm run validator               # console summary (all corpora)
npm run validator:validate      # same as above, explicit
npm run validator:html          # generate HTML report
npm run validator:csv           # generate CSV export

# Directly
bun run scripts/cli.ts <command> [options]
```

---

## Commands

### `validate`

Run validation against built-in fixture data and produce a report.

```bash
bun run scripts/cli.ts validate [options]
```

**Examples:**

```bash
# Default: validate all corpora, print console summary
bun run scripts/cli.ts validate

# Validate only RTL corpus, open HTML report
bun run scripts/cli.ts validate --corpus=rtl --report=html --output=rtl.html

# Validate CJK, show only errors, no colour
bun run scripts/cli.ts validate --corpus=cjk --severity=error --no-color

# Verbose per-sample output
bun run scripts/cli.ts validate --verbose

# Export CSV of all results
bun run scripts/cli.ts validate --report=csv --output=results.csv
```

---

### `report`

Transform an existing JSON results file into another format.

```bash
bun run scripts/cli.ts report --input=<file> [options]
```

The `--input` flag is **required** for this command.

Input can be:
- A bare JSON array of `ValidationResult` objects
- A full `ValidationReport` document (produced by `--report=json`)

**Examples:**

```bash
# Re-export stored results as HTML
bun run scripts/cli.ts report --input=results.json --report=html --output=report.html

# Filter stored results to Arabic only, export Markdown
bun run scripts/cli.ts report --input=results.json --language=arabic --report=markdown

# Print console summary of stored results
bun run scripts/cli.ts report --input=results.json
```

---

### `help`

Print usage information.

```bash
bun run scripts/cli.ts help
bun run scripts/cli.ts         # no command also prints help
```

---

## Options

### `--corpus=<name>`

Which built-in fixture corpus to validate.

| Value     | Description                              |
|-----------|------------------------------------------|
| `all`     | All samples (default)                    |
| `english` | English / Latin LTR samples             |
| `rtl`     | Arabic, Hebrew, Urdu (RTL)              |
| `cjk`     | Chinese, Japanese, Korean               |
| `complex` | Thai, Myanmar, Khmer                    |
| `mixed`   | Mixed LTR + RTL strings                 |

**Default:** `all`

---

### `--report=<format>`

Output report format.

| Value      | Description                              |
|------------|------------------------------------------|
| `console`  | Colour-coded text summary (default)      |
| `html`     | Self-contained HTML with filter UI       |
| `csv`      | UTF-8 BOM CSV (Excel compatible)         |
| `markdown` | GitHub-flavored Markdown                 |
| `json`     | Complete JSON document with metadata     |

**Default:** `console`

---

### `--output=<path>`

Write the report to a file instead of stdout. The directory must already exist.

```bash
--output=reports/result.html
--output=/tmp/validation.csv
```

**Default:** stdout

---

### `--input=<path>`

Path to an existing JSON results file. Required for the `report` command.

```bash
--input=results.json
--input=/data/measurement-report.json
```

---

### `--language=<lang>`

Filter results to a single language category.

Valid values: `english`, `arabic`, `hebrew`, `urdu`, `chinese`, `japanese`, `korean`, `thai`, `myanmar`, `khmer`, `mixed`, `unknown`

```bash
--language=arabic
--language=japanese
```

**Default:** all languages included

---

### `--severity=<level>`

Filter to results at or above the given severity level.

| Value      | Includes                                        |
|------------|-------------------------------------------------|
| `exact`    | all results (no filtering)                      |
| `close`    | close, warning, error, critical                 |
| `warning`  | warning, error, critical                        |
| `error`    | error, critical                                 |
| `critical` | critical only                                   |

```bash
--severity=warning    # show only degraded results
--severity=error      # show only failures
```

**Default:** all severities included

---

### `--verbose`

In `console` report mode, print one line per sample in addition to the summary block.

```bash
bun run scripts/cli.ts validate --verbose
```

---

### `--no-color`

Disable ANSI colour codes in console output. Automatically effective when output is piped or redirected.

```bash
bun run scripts/cli.ts validate --no-color | tee report.txt
```

---

## Exit Codes

| Code | Meaning                                                    |
|------|------------------------------------------------------------|
| `0`  | All results pass (`exact` or `close`)                      |
| `1`  | One or more `warning` results, no errors                   |
| `2`  | One or more `error` or `critical` results, or command error|

Use exit codes in CI scripts:

```bash
bun run scripts/cli.ts validate || echo "Validation failed (exit $?)"

# Fail CI only on critical issues
bun run scripts/cli.ts validate
if [ $? -eq 2 ]; then
  echo "Critical measurement failures detected"; exit 1
fi
```

---

## Environment Variables

The CLI itself does not read any environment variables. The underlying Bun runtime respects standard `NODE_*` and `BUN_*` variables.

---

## Troubleshooting

**`Error: --input=<file> is required for the report command.`**
You ran `report` without specifying an input file. Add `--input=path/to/results.json`.

**`Error: input file not found: ...`**
The path supplied to `--input` does not exist. Check the path and working directory.

**`Error: could not parse JSON from ...`**
The input file is not valid JSON. Validate it with `node -e "JSON.parse(require('fs').readFileSync('file.json','utf8'))"`.

**`Error: Unknown report format: ...`**
The value passed to `--report` is not one of `console|html|csv|markdown|json`.

**`Error: Unknown corpus: ...`**
The value passed to `--corpus` is not one of `all|english|rtl|cjk|complex|mixed`.

**HTML report is empty / shows 0 results**
You may have combined `--corpus` and `--language` filters that produced no overlap. Try without `--language` first.

**CSV opens with garbled characters in Excel**
The file is UTF-8 BOM-encoded, which Excel should auto-detect. If it doesn't, use _Data → From Text/CSV_ and select UTF-8 encoding manually.
