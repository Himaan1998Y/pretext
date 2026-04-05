import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { ResultsDatabase } from './results-database.js'
import { DashboardServer } from './dashboard-server.js'
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

function makeRun(
  results: MeasurementResult[] = [],
  overrides: Partial<ValidationRun> = {},
): ValidationRun {
  const summary: ValidationSummary = {
    total: results.length,
    passed: results.length,
    warnings: 0,
    critical: 0,
    passRate: 1.0,
    avgDeltaPercent: 0,
    maxDeltaPercent: 0,
  }
  return {
    id: `run-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    durationMs: 100,
    results,
    summary,
    ...overrides,
  }
}

describe('DashboardServer HTTP API', () => {
  let db: ResultsDatabase
  let server: DashboardServer
  let dbPath: string
  const port = 13200 + Math.floor(Math.random() * 100)

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'dash-test-'))
    dbPath = join(dir, 'test.db')
    db = new ResultsDatabase(dbPath)
    server = new DashboardServer({ port, host: '127.0.0.1', db })
    server.start()
  })

  afterEach(() => {
    server.stop()
    db.close()
    if (existsSync(dbPath)) unlinkSync(dbPath)
  })

  test('GET /api/summary returns statistics JSON', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/api/summary`)
    expect(r.status).toBe(200)
    const json = await r.json()
    expect(typeof json.totalRuns).toBe('number')
    expect(typeof json.totalResults).toBe('number')
    expect(Array.isArray(json.languages)).toBe(true)
  })

  test('GET /api/results returns empty array initially', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/api/results`)
    expect(r.status).toBe(200)
    const json = await r.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json).toHaveLength(0)
  })

  test('GET /api/results returns inserted results', async () => {
    db.insertRun(makeRun([makeResult(), makeResult({ language: 'arabic' })]))
    const r = await fetch(`http://127.0.0.1:${port}/api/results`)
    const json = await r.json()
    expect(json).toHaveLength(2)
  })

  test('GET /api/results filters by language', async () => {
    db.insertRun(makeRun([makeResult({ language: 'english' }), makeResult({ language: 'arabic' })]))
    const r = await fetch(`http://127.0.0.1:${port}/api/results?language=english`)
    const json = await r.json()
    expect(json).toHaveLength(1)
    expect(json[0].language).toBe('english')
  })

  test('GET /api/runs returns run list', async () => {
    db.insertRun(makeRun([makeResult()]))
    const r = await fetch(`http://127.0.0.1:${port}/api/runs`)
    expect(r.status).toBe(200)
    const json = await r.json()
    expect(Array.isArray(json)).toBe(true)
    expect(json).toHaveLength(1)
  })

  test('GET /api/runs/:id returns specific run', async () => {
    const run = makeRun([makeResult()])
    db.insertRun(run)
    const r = await fetch(`http://127.0.0.1:${port}/api/runs/${run.id}`)
    expect(r.status).toBe(200)
    const json = await r.json()
    expect(json.id).toBe(run.id)
  })

  test('GET /api/runs/:id returns 404 for unknown id', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/api/runs/nonexistent`)
    expect(r.status).toBe(404)
  })

  test('GET /dashboard serves HTML', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/dashboard`)
    expect(r.status).toBe(200)
    const text = await r.text()
    expect(text).toContain('<!DOCTYPE html>')
    expect(text).toContain('Measurement Validator Dashboard')
  })

  test('GET / also serves HTML', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/`)
    expect(r.status).toBe(200)
    const text = await r.text()
    expect(text).toContain('<!DOCTYPE html>')
  })

  test('GET /api/performance/trends returns trend data', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/api/performance/trends?language=english&days=7`)
    expect(r.status).toBe(200)
    const json = await r.json()
    expect(Array.isArray(json)).toBe(true)
  })

  test('unknown path returns 404', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/api/unknown`)
    expect(r.status).toBe(404)
  })

  test('OPTIONS request returns CORS headers', async () => {
    const r = await fetch(`http://127.0.0.1:${port}/api/results`, { method: 'OPTIONS' })
    expect(r.status).toBe(200)
    expect(r.headers.get('access-control-allow-origin')).toBe('*')
  })

  test('publishRun stores run in database', async () => {
    const run = makeRun([makeResult()])
    server.publishRun(run)
    const r = await fetch(`http://127.0.0.1:${port}/api/runs`)
    const json = await r.json()
    expect(json).toHaveLength(1)
    expect(json[0].id).toBe(run.id)
  })
})
