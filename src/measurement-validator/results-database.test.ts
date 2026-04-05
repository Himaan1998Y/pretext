import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ResultsDatabase } from './results-database.js'
import { mkdtempSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MeasurementResult, ValidationRun, ValidationSummary } from './types.js'

function makeResult(overrides: Partial<MeasurementResult> = {}): MeasurementResult {
  return {
    id: `r-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    language: 'english',
    font: '16px Inter',
    fontSize: 16,
    text: 'Hello world',
    pretextWidth: 100.0,
    domWidth: 100.5,
    delta: 0.5,
    deltaPercent: 0.5,
    severity: 'ok',
    ...overrides,
  }
}

function makeSummary(overrides: Partial<ValidationSummary> = {}): ValidationSummary {
  return {
    total: 10,
    passed: 9,
    warnings: 1,
    critical: 0,
    passRate: 0.9,
    avgDeltaPercent: 0.5,
    maxDeltaPercent: 2.0,
    ...overrides,
  }
}

function makeRun(
  results: MeasurementResult[] = [],
  overrides: Partial<ValidationRun> = {},
): ValidationRun {
  return {
    id: `run-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    durationMs: 1234,
    results,
    summary: makeSummary({ total: results.length, passed: results.length }),
    ...overrides,
  }
}

describe('ResultsDatabase', () => {
  let db: ResultsDatabase
  let dbPath: string

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'mv-db-test-'))
    dbPath = join(dir, 'test.db')
    db = new ResultsDatabase(dbPath)
  })

  afterEach(() => {
    db.close()
    if (existsSync(dbPath)) unlinkSync(dbPath)
  })

  test('inserts and retrieves a run', () => {
    const results = [
      makeResult({ language: 'english' }),
      makeResult({ language: 'arabic', severity: 'warning' }),
    ]
    const run = makeRun(results)
    db.insertRun(run)

    const loaded = db.getRunById(run.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe(run.id)
    expect(loaded!.results).toHaveLength(2)
  })

  test('getLatestRun returns most recent', () => {
    const run1 = makeRun([], { timestamp: Date.now() - 10000 })
    const run2 = makeRun([], { timestamp: Date.now() })
    db.insertRun(run1)
    db.insertRun(run2)

    const latest = db.getLatestRun()
    expect(latest!.id).toBe(run2.id)
  })

  test('queryResults filters by language', () => {
    const r1 = makeResult({ language: 'english' })
    const r2 = makeResult({ language: 'arabic' })
    db.insertRun(makeRun([r1, r2]))

    const english = db.queryResults({ language: 'english' })
    expect(english).toHaveLength(1)
    expect(english[0]!.language).toBe('english')
  })

  test('queryResults filters by severity', () => {
    const r1 = makeResult({ severity: 'ok' })
    const r2 = makeResult({ severity: 'critical' })
    db.insertRun(makeRun([r1, r2]))

    const criticals = db.queryResults({ severity: 'critical' })
    expect(criticals).toHaveLength(1)
    expect(criticals[0]!.severity).toBe('critical')
  })

  test('queryResults with limit', () => {
    const results = Array.from({ length: 10 }, () => makeResult())
    db.insertRun(makeRun(results))
    const limited = db.queryResults({ limit: 3 })
    expect(limited).toHaveLength(3)
  })

  test('getStatistics returns correct counts', () => {
    const results = [
      makeResult({ severity: 'ok' }),
      makeResult({ severity: 'critical' }),
      makeResult({ language: 'chinese' }),
    ]
    db.insertRun(makeRun(results))
    const stats = db.getStatistics()
    expect(stats.totalRuns).toBe(1)
    expect(stats.totalResults).toBe(3)
    expect(stats.criticalCount).toBe(1)
    expect(stats.languages).toContain('english')
    expect(stats.languages).toContain('chinese')
  })

  test('stores and retrieves metadata', () => {
    const r = makeResult({ metadata: { extra: 'data', count: 42 } })
    db.insertRun(makeRun([r]))
    const [loaded] = db.queryResults()
    expect(loaded!.metadata).toEqual({ extra: 'data', count: 42 })
  })

  test('stores and retrieves commit sha and branch', () => {
    const run = makeRun([], { commitSha: 'abc123', branch: 'main' })
    db.insertRun(run)
    const loaded = db.getRunById(run.id)
    expect(loaded!.commitSha).toBe('abc123')
    expect(loaded!.branch).toBe('main')
  })

  test('queryRuns returns multiple runs in desc order', () => {
    const run1 = makeRun([], { timestamp: 1000 })
    const run2 = makeRun([], { timestamp: 2000 })
    db.insertRun(run1)
    db.insertRun(run2)
    const runs = db.queryRuns()
    expect(runs[0]!.timestamp).toBeGreaterThan(runs[1]!.timestamp)
  })

  test('returns null for unknown run id', () => {
    expect(db.getRunById('nonexistent')).toBeNull()
  })

  test('returns null from getLatestRun on empty db', () => {
    expect(db.getLatestRun()).toBeNull()
  })
})
