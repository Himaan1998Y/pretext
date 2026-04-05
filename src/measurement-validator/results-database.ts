// SQLite persistence for the measurement-validator.
//
// Stores validation run records in a local SQLite database using Bun's
// built-in `bun:sqlite` module — zero extra dependencies.
//
// Usage:
//   import { ResultsDatabase } from './results-database.js'
//   const db = new ResultsDatabase()
//   await db.insertRun(record)
//   const runs = db.queryRuns({ browser: 'chrome', limit: 50 })
//   db.close()

import { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { BrowserName, ValidationRunRecord } from './types.js'

export type QueryOptions = {
  browser?: BrowserName
  /** ISO timestamp — return only runs at or after this time. */
  since?: string
  /** Maximum number of rows to return (default 100). */
  limit?: number
  /** Free-text tag that must appear in the `tags` field. */
  tag?: string
}

export type RunSummary = {
  runAt: string
  browser: BrowserName
  accuracyPct: number
  regressionCount: number
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS validation_runs (
  id           TEXT PRIMARY KEY,
  run_at       TEXT NOT NULL,
  browser      TEXT NOT NULL,
  accuracy_total   INTEGER NOT NULL,
  accuracy_matches INTEGER NOT NULL,
  benchmark_json   TEXT NOT NULL DEFAULT '{}',
  regression_json  TEXT NOT NULL DEFAULT '{}',
  tags         TEXT NOT NULL DEFAULT ''
)`

export class ResultsDatabase {
  private db: Database

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ?? join(import.meta.dir, '..', '..', '.measurement-results.db')
    this.db = new Database(resolvedPath, { create: true })
    this.db.run(CREATE_TABLE_SQL)
  }

  /** Insert a new validation run record. Generates an ID if one is not provided. */
  insertRun(record: Omit<ValidationRunRecord, 'id'> & { id?: string }): string {
    const id = record.id ?? randomUUID()
    this.db.run(
      `INSERT INTO validation_runs
         (id, run_at, browser, accuracy_total, accuracy_matches,
          benchmark_json, regression_json, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        record.runAt,
        record.browser,
        record.accuracyTotal,
        record.accuracyMatches,
        record.benchmarkJson,
        record.regressionJson,
        record.tags,
      ],
    )
    return id
  }

  /** Retrieve validation runs with optional filters. */
  queryRuns(options: QueryOptions = {}): ValidationRunRecord[] {
    const { browser, since, limit = 100, tag } = options
    const conditions: string[] = []
    const params: (string | number)[] = []

    if (browser != null) {
      conditions.push('browser = ?')
      params.push(browser)
    }
    if (since != null) {
      conditions.push('run_at >= ?')
      params.push(since)
    }
    if (tag != null) {
      conditions.push('tags LIKE ?')
      params.push(`%${tag}%`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const sql = `SELECT id, run_at, browser, accuracy_total, accuracy_matches,
                        benchmark_json, regression_json, tags
                 FROM validation_runs
                 ${where}
                 ORDER BY run_at DESC
                 LIMIT ?`

    const rows = this.db.query(sql).all(...params, limit) as Array<Record<string, unknown>>
    return rows.map(row => ({
      id: row['id'] as string,
      runAt: row['run_at'] as string,
      browser: row['browser'] as BrowserName,
      accuracyTotal: row['accuracy_total'] as number,
      accuracyMatches: row['accuracy_matches'] as number,
      benchmarkJson: row['benchmark_json'] as string,
      regressionJson: row['regression_json'] as string,
      tags: row['tags'] as string,
    }))
  }

  /** Return high-level summaries suitable for the dashboard trends view. */
  querySummaries(options: QueryOptions = {}): RunSummary[] {
    const runs = this.queryRuns(options)
    return runs.map(r => {
      let regressionCount = 0
      try {
        const parsed = JSON.parse(r.regressionJson) as {
          performanceRegressions?: unknown[]
          accuracyRegressions?: unknown[]
        }
        regressionCount =
          (parsed.performanceRegressions?.length ?? 0) +
          (parsed.accuracyRegressions?.length ?? 0)
      } catch {
        // ignore parse errors
      }
      const accuracyPct =
        r.accuracyTotal > 0 ? (r.accuracyMatches / r.accuracyTotal) * 100 : 100
      return {
        runAt: r.runAt,
        browser: r.browser,
        accuracyPct,
        regressionCount,
      }
    })
  }

  /** Delete all runs older than the given ISO timestamp. */
  pruneOlderThan(timestamp: string): number {
    const result = this.db.run('DELETE FROM validation_runs WHERE run_at < ?', [timestamp])
    return result.changes
  }

  close(): void {
    this.db.close()
  }
}
