# Dashboard Guide

The measurement-validator dashboard is a lightweight HTTP + WebSocket server that
shows validation results, summary statistics, and real-time updates.

## Starting the dashboard

```bash
# Default: http://127.0.0.1:3000
bun run scripts/start-dashboard.ts

# Custom port
bun run scripts/start-dashboard.ts --port=4000

# LAN access
bun run scripts/start-dashboard.ts --host=0.0.0.0 --port=3000

# Open in browser immediately
bun run scripts/start-dashboard.ts --open

# Custom database path
bun run scripts/start-dashboard.ts --db=/path/to/results.db
```

## Web UI

Visit `http://localhost:3000/dashboard` after starting the server.

The UI shows:

- **Summary cards** — total runs, total results, avg pass rate, critical count
- **Filter bar** — filter by language, severity, or search text
- **Results table** — all measurement results with pretext/DOM widths and delta
- **Live status** — WebSocket connection indicator; table refreshes automatically on new runs

## REST API

All endpoints return JSON with CORS headers (`Access-Control-Allow-Origin: *`).

### `GET /api/results`

Returns measurement results. Supports query parameters:

| Param | Description |
|-------|-------------|
| `language` | Filter by language name |
| `font` | Filter by font string |
| `severity` | `ok`, `warning`, or `critical` |
| `since` | Unix timestamp ms lower bound |
| `until` | Unix timestamp ms upper bound |
| `limit` | Max results (default: all) |
| `offset` | Pagination offset |

```bash
curl "http://localhost:3000/api/results?language=arabic&severity=critical"
```

### `GET /api/runs`

Returns recent validation runs. Accepts `?limit=<n>` (default 50).

```bash
curl "http://localhost:3000/api/runs"
```

### `GET /api/runs/:id`

Returns a single validation run with all its results.

```bash
curl "http://localhost:3000/api/runs/run-abc123"
```

### `GET /api/summary`

Returns aggregate statistics.

```json
{
  "totalRuns": 42,
  "totalResults": 8400,
  "avgPassRate": 0.987,
  "criticalCount": 12,
  "languages": ["arabic", "chinese", "english", "japanese", "thai"]
}
```

### `GET /api/performance/trends`

Returns daily pass rate / avg delta for the requested language and window.

| Param | Default | Description |
|-------|---------|-------------|
| `language` | `english` | Language to query |
| `days` | `30` | Number of days to look back |

```bash
curl "http://localhost:3000/api/performance/trends?language=arabic&days=14"
```

Response:

```json
[
  { "date": "2026-03-01", "passRate": 0.995, "avgDeltaPercent": 0.12 },
  { "date": "2026-03-02", "passRate": 0.993, "avgDeltaPercent": 0.14 }
]
```

## WebSocket

Connect to `ws://localhost:3000/ws/results` to receive real-time push events.

Events:

```json
{ "type": "run_complete", "runId": "run-abc123" }
```

On receiving `run_complete`, fetch updated data from `/api/results` and `/api/summary`.

## Publishing runs programmatically

```typescript
import { ResultsDatabase } from './src/measurement-validator/results-database.js'
import { DashboardServer } from './src/measurement-validator/dashboard-server.js'

const db = new ResultsDatabase('.measurement-results.db')
const server = new DashboardServer({ port: 3000, db })
server.start()

// After a validation run completes:
server.publishRun(validationRun)  // stores in DB + notifies WebSocket clients
```

## Data storage

Results are stored in a SQLite database (default: `.measurement-results.db`).
The database is created automatically on first start.

To inspect it directly:

```bash
bun -e "
import { ResultsDatabase } from './src/measurement-validator/results-database.js'
const db = new ResultsDatabase()
console.log(db.getStatistics())
db.close()
"
```
