# Measurement Validator — Setup Guide

A developer tool for detecting divergences between Pretext's canvas-based text measurement and the browser DOM rendering. Supports 20+ languages, structured reports, a live dashboard, and CI/CD integration.

## Quick Start

```bash
# Install (bun required)
bun install

# Run validation on built-in sample texts
bun run scripts/validator-cli.ts validate

# Stream results in real time
bun run scripts/validator-cli.ts validate --stream

# Export an HTML report
bun run scripts/validator-cli.ts validate --report=html --output=report.html
```

## Installation

No extra dependencies are needed for the core validator. The CLI and server use the packages already in `package.json`.

The SQLite database module uses Bun's built-in `bun:sqlite` driver. A pure-JS in-memory fallback is used automatically in environments without SQLite support.

## CI / GitHub Actions

Add the workflow to your repository — it is already included at `.github/workflows/validate.yml`.

### What the workflow does

| Step | Description |
|------|-------------|
| Type-check | `bun run check` — TypeScript + oxlint |
| Unit tests | `bun test` |
| Validation | Runs all sample texts, produces JSON/HTML/Markdown reports |
| Performance check | Compares against `performance-baseline.json` |
| Baseline update | Auto-commits updated baseline on `main` when all pass |
| PR comment | Posts a summary comment with pass rate |
| Artifacts | Uploads `validation-report.html` and `validation-report.md` for 30 days |
| Slack notify | Posts to `SLACK_WEBHOOK_URL` secret on regression (optional) |
| Build failure | Exits non-zero on critical divergences |

### Secrets

| Secret | Purpose |
|--------|---------|
| `SLACK_WEBHOOK_URL` | Optional incoming webhook URL for regression alerts |

## CLI Reference

```
bun run scripts/validator-cli.ts <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `validate` | Run validation on sample texts (default) |
| `report` | Convert existing JSON results to another format |
| `watch` | Re-validate whenever a file changes |
| `stream` | Continuously stream real-time results |
| `trends` | Show historical performance trends |
| `dashboard` | Start the HTTP dashboard server |
| `benchmark` | Run benchmarks; `--update-baseline` to persist |

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--language=<lang>` | all | Filter to one language (`en`, `ar`, `zh`, …) |
| `--severity=<sev>` | all | Filter: `pass` \| `warning` \| `critical` |
| `--report=<fmt>` | `json` | Output format: `json` \| `csv` \| `markdown` \| `html` |
| `--output=<path>` | stdout | Write report to file |
| `--input=<path>` | — | Input JSON file (for `report` / `watch`) |
| `--db=<path>` | `measurements.db` | SQLite database path |
| `--baseline=<path>` | `performance-baseline.json` | Baseline JSON |
| `--port=<n>` | `3000` | Dashboard server port |
| `--stream` | off | Print each result live |
| `--limit=<n>` | `1000` | Max results to process |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | All pass |
| `1` | Warnings present |
| `2` | Critical divergences detected |

## Dashboard

```bash
bun run scripts/validator-cli.ts dashboard --port=3000
```

Opens at <http://localhost:3000>. The dashboard provides:

- **Live statistics cards** — total, passed, warnings, criticals, pass rate
- **Performance trends grid** — per-language avg/median/p95/p99/min/max
- **Filterable results table** — search by text, filter by language or severity
- **WebSocket live updates** — results pushed in real time with <50 ms latency

### REST API

| Endpoint | Description |
|----------|-------------|
| `GET /api/results` | All stored results (supports `?language=ar&severity=critical&limit=100`) |
| `GET /api/summary` | Aggregated statistics |
| `GET /api/performance/trends` | Per-language performance metrics |
| `WS  /ws` | WebSocket stream for real-time result events |

## Performance Tracking

```bash
# View historical trends from the database
bun run scripts/validator-cli.ts trends

# Benchmark and update baseline
bun run scripts/validator-cli.ts benchmark --update-baseline
```

The baseline file `performance-baseline.json` is version-controlled and updated automatically by the CI workflow on `main`.

Regression thresholds:

| Severity | Threshold |
|----------|-----------|
| Minor | 10–20% slowdown |
| Major | 20–40% slowdown |
| Critical | >40% slowdown |

## Programmatic API

```ts
import {
  validateSamples,
  buildSummary,
  exportToHtml,
  computeMetrics,
  detectRegressions,
  MeasurementDatabase,
  SlackNotifier,
  DashboardServer,
} from './src/measurement-validator/index.js'

// Validate samples
const results = await validateSamples([
  { text: 'Hello', language: 'en', canvasLineCount: 1, domLineCount: 1 },
])

// Build summary
const summary = buildSummary(results, 0)

// Export HTML report
const html = exportToHtml(results, summary)

// Persist to SQLite
const db = new MeasurementDatabase({ path: 'measurements.db' })
db.insertResults(results)
db.close()

// Check for regressions
const metrics = computeMetrics(results)
const regressions = detectRegressions(compareToBaseline(metrics, baselineEntries))

// Slack notifications
const slack = new SlackNotifier({ webhookUrl: process.env.SLACK_WEBHOOK_URL! })
await slack.notifyValidation(summary)

// Dashboard server
const server = new DashboardServer({ port: 3000 })
server.start()
server.push(results) // broadcast to WebSocket clients
```

## Troubleshooting

**`bun:sqlite` not available** — the database module uses a pure-JS in-memory fallback automatically. All operations work; data is not persisted to disk.

**Dashboard not loading** — ensure port 3000 is free. Use `--port=8080` to change it.

**WebSocket disconnects** — the dashboard auto-reconnects every 3 seconds.

**Baseline out of date** — run `bun run scripts/validator-cli.ts benchmark --update-baseline` locally and commit `performance-baseline.json`, or merge a PR that triggers the CI baseline update.
