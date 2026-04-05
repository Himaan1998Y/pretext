# Measurement Validator — Phase 4 Documentation

## Overview

The measurement-validator Phase 4 components add GitHub CI integration,
performance tracking, regression detection, a live dashboard server, SQLite
persistence, and Slack notifications on top of the existing accuracy and
benchmark infrastructure.

All components are built with TypeScript and Bun's built-in APIs — no
extra runtime dependencies are needed beyond what is already in
`package.json`.

---

## Components

### 1. GitHub Actions Workflow

**File:** `.github/workflows/measurement-validation.yml`

Runs automatically on every push to `main` and on every pull request:

- TypeScript type-check (`bun run check`)
- Unit tests (`bun test src/layout.test.ts`)
- Performance trends for Chrome
- Regression detection across configured browsers
- Uploads JSON artifacts (performance + regressions)
- Posts a summary comment to open PRs

### 2. Performance Tracker

**File:** `src/measurement-validator/performance-tracker.ts`

Loads benchmark snapshots from `benchmarks/<browser>.json`, compares each
entry against a baseline stored in `.measurement-baseline.json`, and
produces a `PerformanceReport`.

```typescript
import { trackPerformance, writeBaseline, formatPerformanceReport } from './performance-tracker.js'

// Compare current benchmarks against baseline
const report = await trackPerformance('chrome', { warnPct: 10, criticalPct: 25 })
console.log(formatPerformanceReport(report))

// Write a new baseline from current snapshots
await writeBaseline(['chrome', 'safari'])
```

### 3. Regression Detector

**File:** `src/measurement-validator/regression-detector.ts`

Detects accuracy and performance regressions across multiple browsers.

```typescript
import { detectRegressions, formatRegressionReport } from './regression-detector.js'

const report = await detectRegressions(['chrome', 'safari', 'firefox'])
console.log(formatRegressionReport(report))

if (report.hasBlocker) process.exit(1)
```

### 4. Dashboard Server

**File:** `src/measurement-validator/dashboard-server.ts`

An HTTP server (Bun.serve) that exposes the accuracy/benchmark/status data
as a JSON API and serves an embedded HTML dashboard.

```typescript
import { DashboardServer } from './dashboard-server.js'

const server = new DashboardServer({ port: 3001 })
server.start()
// http://localhost:3001 — dashboard UI
// http://localhost:3001/api/status — status JSON
// http://localhost:3001/api/accuracy/chrome — accuracy data
```

**API endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | HTML dashboard |
| GET | `/health` | Liveness check |
| GET | `/api/status` | `status/dashboard.json` |
| GET | `/api/accuracy/:browser` | `accuracy/<browser>.json` |
| GET | `/api/benchmarks/:browser` | `benchmarks/<browser>.json` |
| GET | `/api/runs` | Recent validation runs (SQLite) |
| GET | `/api/runs/summaries` | High-level trend summaries |
| POST | `/api/runs` | Insert a new run record |

### 5. Results Database

**File:** `src/measurement-validator/results-database.ts`

SQLite persistence via Bun's built-in `bun:sqlite`.  Stores validation run
records with accuracy, benchmark, and regression data.

```typescript
import { ResultsDatabase } from './results-database.js'

const db = new ResultsDatabase()

db.insertRun({
  runAt: new Date().toISOString(),
  browser: 'chrome',
  accuracyTotal: 7680,
  accuracyMatches: 7680,
  benchmarkJson: JSON.stringify(benchmarkReport),
  regressionJson: JSON.stringify(regressionReport),
  tags: 'pr:123',
})

const recent = db.queryRuns({ browser: 'chrome', limit: 20 })
const summaries = db.querySummaries({ since: '2026-01-01T00:00:00Z' })
db.close()
```

### 6. Slack Notifier

**File:** `src/measurement-validator/slack-notifier.ts`

Sends formatted Slack messages via an Incoming Webhook URL.  Reads the URL
from `SLACK_WEBHOOK_URL` environment variable when using the factory helper.

```typescript
import { SlackNotifier, createSlackNotifierFromEnv } from './slack-notifier.js'

const notifier = createSlackNotifierFromEnv() // reads SLACK_WEBHOOK_URL
if (notifier) {
  await notifier.notifyRegressionReport(report)
  await notifier.notifyPerformanceReport(perfReport)
  await notifier.notifyText('Custom message')
}
```

---

## CLI Scripts

### `bun run validator:dashboard`

Start the dashboard HTTP server.

```
bun run validator:dashboard [--port=3001] [--host=127.0.0.1] [--no-db]
```

### `bun run validator:trends`

Print performance trend report.

```
bun run validator:trends [--browser=chrome] [--warn=10] [--critical=25] [--json]
```

### `bun run validator:watch`

Watch the `accuracy/` and `benchmarks/` directories and re-run regression
detection whenever a snapshot file changes.

```
bun run validator:watch [--browsers=chrome,safari,firefox] [--slack-webhook=<url>]
```

### `bun run validator:regression-detect`

Run one-shot regression detection (used in CI).

```
bun run validator:regression-detect [--browsers=chrome] [--json] [--fail-on-critical]
```

---

## Configuration

### Performance Baseline

Write a baseline from the current benchmark snapshots:

```bash
bun -e "import('./src/measurement-validator/performance-tracker.js').then(m => m.writeBaseline(['chrome', 'safari']))"
```

This creates `.measurement-baseline.json` which is checked into version
control.  Commit it alongside any intentional performance changes.

### Slack Webhook

Set the `SLACK_WEBHOOK_URL` environment variable (e.g. in a GitHub Actions
secret) to enable Slack notifications.  The notifier is disabled silently
when the variable is absent.

---

## Data Files

| File | Purpose |
|------|---------|
| `accuracy/chrome.json` | Chrome accuracy snapshot (baseline) |
| `accuracy/safari.json` | Safari accuracy snapshot (baseline) |
| `accuracy/firefox.json` | Firefox accuracy snapshot (baseline) |
| `benchmarks/chrome.json` | Chrome benchmark snapshot |
| `benchmarks/safari.json` | Safari benchmark snapshot |
| `status/dashboard.json` | Aggregated status dashboard |
| `.measurement-baseline.json` | Performance baseline (generated, commit after intentional changes) |
| `.measurement-results.db` | SQLite results history (not committed) |
