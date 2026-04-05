// Dashboard HTTP server for the measurement-validator.
//
// Serves a JSON API over the checked-in accuracy/benchmark/status data and an
// optional SQLite results history.  Built on Bun.serve() — no external HTTP
// framework required.
//
// API endpoints:
//   GET /api/status          — status/dashboard.json
//   GET /api/accuracy/:browser  — accuracy/<browser>.json
//   GET /api/benchmarks/:browser — benchmarks/<browser>.json
//   GET /api/runs            — recent validation runs from SQLite (if DB enabled)
//   GET /api/runs/summaries  — high-level trend summaries
//   POST /api/runs           — insert a new run record
//   GET /health              — liveness check
//   GET /                    — embedded dashboard HTML
//
// Usage:
//   import { DashboardServer } from './dashboard-server.js'
//   const server = new DashboardServer({ port: 3001 })
//   server.start()

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ResultsDatabase } from './results-database.js'
import type { QueryOptions } from './results-database.js'
import type { BrowserName, ValidationRunRecord } from './types.js'

export type DashboardServerOptions = {
  port?: number
  host?: string
  /** Enable the SQLite results database. Defaults to true. */
  enableDatabase?: boolean
  /** Path to the SQLite file. Defaults to .measurement-results.db in repoRoot. */
  dbPath?: string
  /** Repository root for resolving data files. */
  repoRoot?: string
}

const BROWSERS: BrowserName[] = ['chrome', 'safari', 'firefox']

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

function notFound(message: string): Response {
  return jsonResponse({ error: message }, 404)
}

function loadJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function buildDashboardHtml(repoRoot: string): string {
  const statusPath = join(repoRoot, 'status', 'dashboard.json')
  const status = loadJsonFile(statusPath)

  const browsers = BROWSERS.map(b => {
    const acc = loadJsonFile(join(repoRoot, 'accuracy', `${b}.json`)) as
      | { total?: number; matchCount?: number }
      | null
    return {
      name: b,
      total: acc?.total ?? 0,
      matches: acc?.matchCount ?? 0,
    }
  })

  const tableRows = browsers
    .map(
      b =>
        `<tr>
           <td>${b.name}</td>
           <td>${b.matches}</td>
           <td>${b.total}</td>
           <td>${b.total > 0 ? ((b.matches / b.total) * 100).toFixed(2) : 'n/a'}%</td>
         </tr>`,
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Measurement Validator Dashboard</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #222; background: #f9f9f9; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.1rem; margin-top: 2rem; margin-bottom: 0.5rem; color: #444; }
    table { border-collapse: collapse; min-width: 500px; background: #fff; box-shadow: 0 1px 3px #0001; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 1rem; text-align: left; }
    th { background: #f0f0f0; }
    pre { background: #fff; padding: 1rem; border: 1px solid #ddd; overflow-x: auto; font-size: 0.85rem; }
    .ok { color: #2a7a2a; } .warn { color: #b26a00; } .err { color: #b00; }
    footer { margin-top: 2rem; font-size: 0.8rem; color: #999; }
  </style>
</head>
<body>
  <h1>📊 Measurement Validator Dashboard</h1>

  <h2>Browser Accuracy</h2>
  <table>
    <thead><tr><th>Browser</th><th>Matches</th><th>Total</th><th>Accuracy</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>

  <h2>Status Dashboard JSON</h2>
  <pre id="status-json">${JSON.stringify(status, null, 2)}</pre>

  <h2>Recent Validation Runs</h2>
  <div id="runs-table"><em>Loading…</em></div>

  <footer>Auto-refreshes every 30 s · <a href="/api/status">Raw JSON</a></footer>

  <script>
    async function loadRuns() {
      try {
        const res = await fetch('/api/runs/summaries?limit=20')
        const data = await res.json()
        if (!Array.isArray(data) || data.length === 0) {
          document.getElementById('runs-table').textContent = 'No runs stored yet.'
          return
        }
        const rows = data.map(r =>
          '<tr><td>' + r.runAt + '</td><td>' + r.browser +
          '</td><td>' + r.accuracyPct.toFixed(2) + '%</td><td>' + r.regressionCount + '</td></tr>'
        ).join('')
        document.getElementById('runs-table').innerHTML =
          '<table><thead><tr><th>Run At</th><th>Browser</th><th>Accuracy</th><th>Regressions</th></tr></thead><tbody>' + rows + '</tbody></table>'
      } catch (e) {
        document.getElementById('runs-table').textContent = 'Error loading runs: ' + e.message
      }
    }
    loadRuns()
    setInterval(loadRuns, 30000)
  </script>
</body>
</html>`
}

export class DashboardServer {
  private options: Required<DashboardServerOptions>
  private db: ResultsDatabase | null = null
  private server: ReturnType<typeof Bun.serve> | null = null

  constructor(options: DashboardServerOptions = {}) {
    this.options = {
      port: options.port ?? 3001,
      host: options.host ?? '127.0.0.1',
      enableDatabase: options.enableDatabase ?? true,
      dbPath: options.dbPath ?? '',
      repoRoot: options.repoRoot ?? join(import.meta.dir, '..', '..'),
    }
  }

  start(): void {
    if (this.options.enableDatabase) {
      this.db = new ResultsDatabase(
        this.options.dbPath !== '' ? this.options.dbPath : undefined,
      )
    }

    this.server = Bun.serve({
      port: this.options.port,
      hostname: this.options.host,
      fetch: (req: Request): Response | Promise<Response> => this.handleRequest(req),
    })

    console.log(
      `Dashboard server running at http://${this.options.host}:${this.options.port}`,
    )
  }

  stop(): void {
    void this.server?.stop()
    this.db?.close()
  }

  private handleRequest(req: Request): Response | Promise<Response> {
    const url = new URL(req.url)
    const { pathname } = url
    const { repoRoot } = this.options

    if (req.method === 'GET') {
      if (pathname === '/' || pathname === '/dashboard') {
        return new Response(buildDashboardHtml(repoRoot), {
          headers: { 'Content-Type': 'text/html' },
        })
      }
      if (pathname === '/health') {
        return jsonResponse({ status: 'ok', ts: new Date().toISOString() })
      }
      if (pathname === '/api/status') {
        const data = loadJsonFile(join(repoRoot, 'status', 'dashboard.json'))
        return data != null ? jsonResponse(data) : notFound('status/dashboard.json not found')
      }
      if (pathname.startsWith('/api/accuracy/')) {
        const browser = pathname.slice('/api/accuracy/'.length) as BrowserName
        if (!BROWSERS.includes(browser)) return notFound(`Unknown browser: ${browser}`)
        const data = loadJsonFile(join(repoRoot, 'accuracy', `${browser}.json`))
        return data != null ? jsonResponse(data) : notFound(`accuracy/${browser}.json not found`)
      }
      if (pathname.startsWith('/api/benchmarks/')) {
        const browser = pathname.slice('/api/benchmarks/'.length) as BrowserName
        if (!BROWSERS.includes(browser)) return notFound(`Unknown browser: ${browser}`)
        const data = loadJsonFile(join(repoRoot, 'benchmarks', `${browser}.json`))
        return data != null ? jsonResponse(data) : notFound(`benchmarks/${browser}.json not found`)
      }
      if (pathname === '/api/runs') {
        if (this.db == null) return jsonResponse({ error: 'Database not enabled' }, 503)
        const browser = url.searchParams.get('browser') as BrowserName | null
        const since = url.searchParams.get('since')
        const limit = Number(url.searchParams.get('limit') ?? '100')
        const tag = url.searchParams.get('tag')
        const queryOpts: QueryOptions = { limit }
        if (browser != null) queryOpts.browser = browser
        if (since != null) queryOpts.since = since
        if (tag != null) queryOpts.tag = tag
        const runs = this.db.queryRuns(queryOpts)
        return jsonResponse(runs)
      }
      if (pathname === '/api/runs/summaries') {
        if (this.db == null) return jsonResponse({ error: 'Database not enabled' }, 503)
        const browser = url.searchParams.get('browser') as BrowserName | null
        const since = url.searchParams.get('since')
        const limit = Number(url.searchParams.get('limit') ?? '50')
        const summaryOpts: QueryOptions = { limit }
        if (browser != null) summaryOpts.browser = browser
        if (since != null) summaryOpts.since = since
        const summaries = this.db.querySummaries(summaryOpts)
        return jsonResponse(summaries)
      }
    }

    if (req.method === 'POST' && pathname === '/api/runs') {
      return this.handlePostRun(req)
    }

    return notFound(`No route for ${req.method} ${pathname}`)
  }

  private async handlePostRun(req: Request): Promise<Response> {
    if (this.db == null) return jsonResponse({ error: 'Database not enabled' }, 503)
    let body: Omit<ValidationRunRecord, 'id'>
    try {
      body = (await req.json()) as Omit<ValidationRunRecord, 'id'>
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }
    const id = this.db.insertRun(body)
    return jsonResponse({ id }, 201)
  }
}
