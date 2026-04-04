# CLI Reference

## Commands

### validate

Validate measurements against a corpus.

```bash
bun run scripts/cli.ts validate [options]
```

**Options**

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--corpus` | `all` \| `english` \| `rtl` \| `cjk` \| `complex` \| `mixed` | `english` | Which test corpus to validate |
| `--report` | `csv` \| `markdown` \| `html` \| `json` \| `console` | `console` | Output format |
| `--output` | path | stdout | File to write the report |
| `--language` | BCP-47 code | (all) | Filter by language (e.g. `en`, `ar`) |
| `--severity` | `pass` \| `warning` \| `error` \| `critical` | (all) | Filter by severity |
| `--font` | pattern | (all) | Filter by font pattern |
| `--verbose` | — | false | Show detailed output and summary to stderr |
| `--no-color` | — | false | Disable colored output |

**Examples**

```bash
# Validate English corpus (default)
bun run scripts/cli.ts validate

# Validate all and export as CSV
bun run scripts/cli.ts validate --corpus=all --report=csv --output=all.csv

# Show only Arabic warnings
bun run scripts/cli.ts validate --language=ar --severity=warning

# Export as JSON for piping
bun run scripts/cli.ts validate --report=json | jq '.[] | select(.overallSeverity=="critical")'
```

---

### report

Generate a report from existing saved results.

```bash
bun run scripts/cli.ts report --input=results.json [options]
```

**Options**

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--input` | path | *(required)* | Path to JSON results file |
| `--format` | `csv` \| `markdown` \| `html` \| `json` \| `console` | `console` | Output format |
| `--output` | path | stdout | File to write the report |
| `--language` | BCP-47 code | (all) | Filter by language |
| `--severity` | `pass` \| `warning` \| `error` \| `critical` | (all) | Filter by severity |

**Example**

```bash
bun run scripts/cli.ts report --input=results.json --format=html --output=report.html
```

---

### help

Show top-level help text.

```bash
bun run scripts/cli.ts help
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All measurements passed |
| `1` | Warnings or errors detected |
| `2` | Critical issues detected |
| `3` | Invalid arguments |
| `4` | File I/O or parsing error |

---

## Environment Variables

These variables are reserved for future use and are not yet implemented.

| Variable | Description |
|----------|-------------|
| `MEASUREMENT_VALIDATOR_DEBUG=1` | Enable debug logging |
| `MEASUREMENT_VALIDATOR_COLORS=false` | Disable colored output |
| `MEASUREMENT_VALIDATOR_TIMEOUT=30000` | Timeout in milliseconds |

---

## npm Script Shortcut

Add the following to `package.json` to expose a shorter `validator` alias:

```json
{
  "scripts": {
    "validator": "bun run scripts/cli.ts"
  }
}
```

Then use:

```bash
npm run validator validate --corpus=all --report=csv --output=all.csv
```
