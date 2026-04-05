// SQLite-backed results database for the measurement-validator.
//
// Stores all validation runs and measurement results for historical analysis,
// trend detection, and dashboard queries. Uses Bun's built-in SQLite support.

import { Database } from 'bun:sqlite'
import type {
  DatabaseQueryOptions,
  MeasurementResult,
  Severity,
  ValidationRun,
  ValidationSummary,
} from './types.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS validation_runs (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  commit_sha TEXT,
  branch TEXT,
  duration_ms INTEGER NOT NULL,
  total INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  warnings INTEGER NOT NULL,
  critical INTEGER NOT NULL,
  pass_rate REAL NOT NULL,
  avg_delta_percent REAL NOT NULL,
  max_delta_percent REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS measurement_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  timestamp INTEGER NOT NULL,
  language TEXT NOT NULL,
  font TEXT NOT NULL,
  font_size REAL NOT NULL,
  text TEXT NOT NULL,
  pretext_width REAL NOT NULL,
  dom_width REAL NOT NULL,
  delta REAL NOT NULL,
  delta_percent REAL NOT NULL,
  severity TEXT NOT NULL,
  root_cause TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_results_run ON measurement_results(run_id);
CREATE INDEX IF NOT EXISTS idx_results_lang ON measurement_results(language);
CREATE INDEX IF NOT EXISTS idx_results_severity ON measurement_results(severity);
CREATE INDEX IF NOT EXISTS idx_results_ts ON measurement_results(timestamp);
CREATE INDEX IF NOT EXISTS idx_runs_ts ON validation_runs(timestamp);
`

export class ResultsDatabase {
  private db: Database

  constructor(path: string = '.measurement-results.db') {
    this.db = new Database(path)
    this.db.exec(SCHEMA)
  }

  insertRun(run: ValidationRun): void {
    const { summary } = run
    this.db
      .prepare(
        `INSERT OR REPLACE INTO validation_runs
         (id, timestamp, commit_sha, branch, duration_ms,
          total, passed, warnings, critical,
          pass_rate, avg_delta_percent, max_delta_percent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        run.id,
        run.timestamp,
        run.commitSha ?? null,
        run.branch ?? null,
        run.durationMs,
        summary.total,
        summary.passed,
        summary.warnings,
        summary.critical,
        summary.passRate,
        summary.avgDeltaPercent,
        summary.maxDeltaPercent,
      )

    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO measurement_results
       (id, run_id, timestamp, language, font, font_size,
        text, pretext_width, dom_width, delta, delta_percent,
        severity, root_cause, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const r of run.results) {
      stmt.run(
        r.id,
        run.id,
        r.timestamp,
        r.language,
        r.font,
        r.fontSize,
        r.text,
        r.pretextWidth,
        r.domWidth,
        r.delta,
        r.deltaPercent,
        r.severity,
        r.rootCause ?? null,
        r.metadata ? JSON.stringify(r.metadata) : null,
      )
    }
  }

  queryResults(opts: DatabaseQueryOptions = {}): MeasurementResult[] {
    const conditions: string[] = []
    const params: (string | number | null)[] = []

    if (opts.language) {
      conditions.push('language = ?')
      params.push(opts.language)
    }
    if (opts.font) {
      conditions.push('font = ?')
      params.push(opts.font)
    }
    if (opts.severity) {
      conditions.push('severity = ?')
      params.push(opts.severity)
    }
    if (opts.since != null) {
      conditions.push('timestamp >= ?')
      params.push(opts.since)
    }
    if (opts.until != null) {
      conditions.push('timestamp <= ?')
      params.push(opts.until)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = opts.limit != null ? `LIMIT ${opts.limit}` : ''
    const offset = opts.offset != null ? `OFFSET ${opts.offset}` : ''

    const rows = this.db
      .prepare(
        `SELECT * FROM measurement_results
         ${where}
         ORDER BY timestamp DESC
         ${limit} ${offset}`,
      )
      .all(...params) as Array<Record<string, unknown>>

    return rows.map(rowToResult)
  }

  queryRuns(limit = 50): ValidationRun[] {
    const runRows = this.db
      .prepare(
        `SELECT * FROM validation_runs ORDER BY timestamp DESC LIMIT ?`,
      )
      .all(limit) as Array<Record<string, unknown>>

    return runRows.map((row) => {
      const results = this.db
        .prepare(`SELECT * FROM measurement_results WHERE run_id = ?`)
        .all(row['id'] as string) as Array<Record<string, unknown>>

      return rowToRun(row, results.map(rowToResult))
    })
  }

  getRunById(id: string): ValidationRun | null {
    const row = this.db
      .prepare(`SELECT * FROM validation_runs WHERE id = ?`)
      .get(id) as Record<string, unknown> | null
    if (!row) return null

    const results = this.db
      .prepare(`SELECT * FROM measurement_results WHERE run_id = ?`)
      .all(id) as Array<Record<string, unknown>>

    return rowToRun(row, results.map(rowToResult))
  }

  getLatestRun(): ValidationRun | null {
    const row = this.db
      .prepare(`SELECT * FROM validation_runs ORDER BY timestamp DESC LIMIT 1`)
      .get() as Record<string, unknown> | null
    if (!row) return null

    const results = this.db
      .prepare(`SELECT * FROM measurement_results WHERE run_id = ?`)
      .all(row['id'] as string) as Array<Record<string, unknown>>

    return rowToRun(row, results.map(rowToResult))
  }

  getLanguageTrends(
    language: string,
    days = 30,
  ): Array<{ date: string; passRate: number; avgDeltaPercent: number }> {
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    const rows = this.db
      .prepare(
        `SELECT
           date(timestamp / 1000, 'unixepoch') as date,
           AVG(pass_rate) as pass_rate,
           AVG(avg_delta_percent) as avg_delta
         FROM validation_runs
         WHERE timestamp >= ?
         GROUP BY date
         ORDER BY date ASC`,
      )
      .all(since) as Array<{ date: string; pass_rate: number; avg_delta: number }>

    return rows.map((r) => ({
      date: r.date,
      passRate: r.pass_rate,
      avgDeltaPercent: r.avg_delta,
    }))
  }

  getStatistics(): {
    totalRuns: number
    totalResults: number
    avgPassRate: number
    criticalCount: number
    languages: string[]
  } {
    const runs = this.db
      .prepare(`SELECT COUNT(*) as count, AVG(pass_rate) as avg_pass FROM validation_runs`)
      .get() as { count: number; avg_pass: number }

    const results = this.db
      .prepare(`SELECT COUNT(*) as count FROM measurement_results`)
      .get() as { count: number }

    const critical = this.db
      .prepare(`SELECT COUNT(*) as count FROM measurement_results WHERE severity = 'critical'`)
      .get() as { count: number }

    const langs = this.db
      .prepare(`SELECT DISTINCT language FROM measurement_results ORDER BY language`)
      .all() as Array<{ language: string }>

    return {
      totalRuns: runs.count,
      totalResults: results.count,
      avgPassRate: runs.avg_pass ?? 0,
      criticalCount: critical.count,
      languages: langs.map((l) => l.language),
    }
  }

  close(): void {
    this.db.close()
  }
}

function rowToResult(row: Record<string, unknown>): MeasurementResult {
  const base: MeasurementResult = {
    id: row['id'] as string,
    timestamp: row['timestamp'] as number,
    language: row['language'] as string,
    font: row['font'] as string,
    fontSize: row['font_size'] as number,
    text: row['text'] as string,
    pretextWidth: row['pretext_width'] as number,
    domWidth: row['dom_width'] as number,
    delta: row['delta'] as number,
    deltaPercent: row['delta_percent'] as number,
    severity: row['severity'] as Severity,
  }
  const rootCause = row['root_cause'] as string | null
  if (rootCause != null) base.rootCause = rootCause
  const metadata = row['metadata'] as string | null
  if (metadata != null) base.metadata = JSON.parse(metadata) as Record<string, unknown>
  return base
}

function rowToRun(
  row: Record<string, unknown>,
  results: MeasurementResult[],
): ValidationRun {
  const summary: ValidationSummary = {
    total: row['total'] as number,
    passed: row['passed'] as number,
    warnings: row['warnings'] as number,
    critical: row['critical'] as number,
    passRate: row['pass_rate'] as number,
    avgDeltaPercent: row['avg_delta_percent'] as number,
    maxDeltaPercent: row['max_delta_percent'] as number,
  }
  const run: ValidationRun = {
    id: row['id'] as string,
    timestamp: row['timestamp'] as number,
    durationMs: row['duration_ms'] as number,
    results,
    summary,
  }
  const commitSha = row['commit_sha'] as string | null
  if (commitSha != null) run.commitSha = commitSha
  const branch = row['branch'] as string | null
  if (branch != null) run.branch = branch
  return run
}
