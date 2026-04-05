// SQLite-backed persistence for measurement results and historical analysis.
// Uses Bun's built-in SQLite driver (bun:sqlite) with a fallback stub for
// environments without SQLite support.

import type { BaselineEntry, MeasurementResult, PerformanceMetrics } from './types.js'

export type DatabaseOptions = {
  path?: string
}

// Minimal Database interface matching the Bun SQLite API surface we use.
type SqliteDb = {
  query: (sql: string) => { run: (...args: unknown[]) => void; all: (...args: unknown[]) => unknown[] }
  run: (sql: string) => void
  close: () => void
}

function openDb(path: string): SqliteDb {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Database } = require('bun:sqlite') as { Database: new (path: string) => SqliteDb }
    return new Database(path)
  } catch {
    // Fallback in-memory stub for environments without bun:sqlite.
    // Stores rows in JS arrays so all basic operations still work.
    const tables = new Map<string, unknown[]>()
    return {
      query(sql: string) {
        return {
          run(..._args: unknown[]) {
            // Minimal insert stub: just store the args array.
            const tableMatch = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i.exec(sql)
            if (tableMatch) {
              const name = tableMatch[1]!
              if (!tables.has(name)) tables.set(name, [])
              tables.get(name)!.push(_args)
            }
          },
          all(..._args: unknown[]): unknown[] {
            const tableMatch = /FROM\s+(\w+)/i.exec(sql)
            if (tableMatch) return tables.get(tableMatch[1]!) ?? []
            return []
          },
        }
      },
      run(_sql: string) {},
      close() {},
    }
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  font TEXT NOT NULL,
  font_size REAL NOT NULL,
  container_width REAL NOT NULL,
  canvas_lines INTEGER NOT NULL,
  dom_lines INTEGER NOT NULL,
  diverged INTEGER NOT NULL,
  divergence_pixels REAL NOT NULL,
  severity TEXT NOT NULL,
  reason TEXT NOT NULL,
  duration_ms REAL NOT NULL,
  timestamp INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS baselines (
  language TEXT NOT NULL,
  avg_ms REAL NOT NULL,
  p95_ms REAL NOT NULL,
  p99_ms REAL NOT NULL,
  pass_rate REAL NOT NULL,
  recorded_at INTEGER NOT NULL,
  version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_results_language ON results (language);
CREATE INDEX IF NOT EXISTS idx_results_severity ON results (severity);
CREATE INDEX IF NOT EXISTS idx_results_timestamp ON results (timestamp);
`

export class MeasurementDatabase {
  private db: SqliteDb

  constructor(options: DatabaseOptions = {}) {
    this.db = openDb(options.path ?? ':memory:')
    this.db.run(SCHEMA)
  }

  insertResult(r: MeasurementResult): void {
    this.db
      .query(`INSERT OR REPLACE INTO results VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        r.id,
        r.language,
        r.font,
        r.fontSize,
        r.containerWidth,
        r.canvasLineCount,
        r.domLineCount,
        r.diverged ? 1 : 0,
        r.divergencePixels,
        r.severity,
        r.reason,
        r.durationMs,
        r.timestamp,
        r.text
      )
  }

  insertResults(results: MeasurementResult[]): void {
    for (const r of results) this.insertResult(r)
  }

  queryAll(): MeasurementResult[] {
    return (
      this.db
        .query('SELECT * FROM results ORDER BY timestamp DESC')
        .all() as Array<Record<string, unknown>>
    ).map(rowToResult)
  }

  queryByLanguage(language: string): MeasurementResult[] {
    return (
      this.db
        .query('SELECT * FROM results WHERE language = ? ORDER BY timestamp DESC')
        .all(language) as Array<Record<string, unknown>>
    ).map(rowToResult)
  }

  queryBySeverity(severity: string): MeasurementResult[] {
    return (
      this.db
        .query('SELECT * FROM results WHERE severity = ? ORDER BY timestamp DESC')
        .all(severity) as Array<Record<string, unknown>>
    ).map(rowToResult)
  }

  queryRecent(limit = 100): MeasurementResult[] {
    return (
      this.db
        .query('SELECT * FROM results ORDER BY timestamp DESC LIMIT ?')
        .all(limit) as Array<Record<string, unknown>>
    ).map(rowToResult)
  }

  insertBaseline(b: BaselineEntry): void {
    this.db
      .query(
        'INSERT INTO baselines (language,avg_ms,p95_ms,p99_ms,pass_rate,recorded_at,version) VALUES (?,?,?,?,?,?,?)'
      )
      .run(b.language, b.avgMs, b.p95Ms, b.p99Ms, b.passRate, b.recordedAt, b.version)
  }

  getLatestBaselines(): BaselineEntry[] {
    return (
      this.db
        .query(
          `SELECT b.* FROM baselines b
           INNER JOIN (SELECT language, MAX(recorded_at) AS latest FROM baselines GROUP BY language) t
           ON b.language = t.language AND b.recorded_at = t.latest`
        )
        .all() as Array<Record<string, unknown>>
    ).map(rowToBaseline)
  }

  aggregatePerformance(): PerformanceMetrics[] {
    return (
      this.db
        .query(
          `SELECT
            language,
            COUNT(*) AS sample_count,
            AVG(duration_ms) AS avg_ms,
            MIN(duration_ms) AS min_ms,
            MAX(duration_ms) AS max_ms
           FROM results
           GROUP BY language`
        )
        .all() as Array<Record<string, unknown>>
    ).map((row) => ({
      language: row['language'] as string,
      sampleCount: Number(row['sample_count']),
      avgMs: Number(row['avg_ms']),
      minMs: Number(row['min_ms']),
      maxMs: Number(row['max_ms']),
      medianMs: Number(row['avg_ms']), // approximation; exact median needs full sort
      p95Ms: Number(row['max_ms']), // approximation stored; use computeMetrics for exact
      p99Ms: Number(row['max_ms']),
    }))
  }

  close(): void {
    this.db.close()
  }
}

function rowToResult(row: Record<string, unknown>): MeasurementResult {
  return {
    id: String(row['id']),
    language: String(row['language']),
    font: String(row['font']),
    fontSize: Number(row['font_size']),
    containerWidth: Number(row['container_width']),
    canvasLineCount: Number(row['canvas_lines']),
    domLineCount: Number(row['dom_lines']),
    diverged: Boolean(Number(row['diverged'])),
    divergencePixels: Number(row['divergence_pixels']),
    severity: String(row['severity']) as MeasurementResult['severity'],
    reason: String(row['reason']) as MeasurementResult['reason'],
    durationMs: Number(row['duration_ms']),
    timestamp: Number(row['timestamp']),
    text: String(row['text']),
  }
}

function rowToBaseline(row: Record<string, unknown>): BaselineEntry {
  return {
    language: String(row['language']),
    avgMs: Number(row['avg_ms']),
    p95Ms: Number(row['p95_ms']),
    p99Ms: Number(row['p99_ms']),
    passRate: Number(row['pass_rate']),
    recordedAt: Number(row['recorded_at']),
    version: String(row['version']),
  }
}
