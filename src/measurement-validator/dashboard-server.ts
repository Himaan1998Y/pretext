// Dashboard HTTP server with REST API endpoints and WebSocket real-time updates.
// Serves a web UI on localhost:3000 (configurable) with live validation streaming.
//
// REST endpoints:
//   GET /api/results          — all stored results
//   GET /api/results?language=ar&severity=critical  — filtered results
//   GET /api/summary          — aggregated statistics
//   GET /api/performance/trends — per-language performance metrics
//
// WebSocket:
//   ws://localhost:PORT/ws    — subscribe to real-time result events

import type { MeasurementResult, ValidationSummary } from './types.js'
import { MeasurementDatabase } from './database.js'
import { buildSummary } from './classifier.js'
import { computeMetrics } from './performance-tracker.js'
import { DASHBOARD_HTML } from './dashboard-ui.js'

export type DashboardOptions = {
  port?: number
  host?: string
  dbPath?: string
}

type WsClient = { send: (data: string) => void; readyState: number }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export class DashboardServer {
  private db: MeasurementDatabase
  private wsClients: Set<WsClient> = new Set()
  private server: ReturnType<typeof Bun.serve> | null = null
  private port: number
  private host: string

  constructor(options: DashboardOptions = {}) {
    this.port = options.port ?? 3000
    this.host = options.host ?? '127.0.0.1'
    this.db = new MeasurementDatabase({ path: options.dbPath ?? ':memory:' })
  }

  start(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this

    this.server = Bun.serve({
      port: this.port,
      hostname: this.host,

      fetch(req, server) {
        const url = new URL(req.url)

        // WebSocket upgrade
        if (url.pathname === '/ws') {
          const upgraded = server.upgrade(req, { data: undefined })
          if (upgraded) return undefined
          return new Response('WebSocket upgrade required', { status: 426 })
        }

        // OPTIONS pre-flight
        if (req.method === 'OPTIONS') {
          return new Response(null, { status: 204, headers: CORS_HEADERS })
        }

        return self.handleHttp(url, req)
      },

      websocket: {
        open(ws) {
          self.wsClients.add(ws as unknown as WsClient)
        },
        close(ws) {
          self.wsClients.delete(ws as unknown as WsClient)
        },
        message(_ws, _msg) {
          // No inbound WS commands defined yet.
        },
      },
    })

    console.log(`Dashboard running at http://${this.host}:${this.port}`)
  }

  stop(): void {
    void this.server?.stop()
    this.db.close()
  }

  // Push new results into the database and broadcast to all WebSocket clients.
  push(results: MeasurementResult[]): void {
    this.db.insertResults(results)
    this.broadcast({ type: 'results', payload: results })
  }

  private broadcast(event: unknown): void {
    const msg = JSON.stringify(event)
    for (const client of this.wsClients) {
      // readyState 1 = OPEN
      if (client.readyState === 1) {
        try {
          client.send(msg)
        } catch {
          this.wsClients.delete(client)
        }
      }
    }
  }

  private handleHttp(url: URL, _req: Request): Response {
    const headers = { 'Content-Type': 'application/json', ...CORS_HEADERS }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(DASHBOARD_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
      })
    }

    if (url.pathname === '/api/results') {
      let results = this.db.queryAll()
      const lang = url.searchParams.get('language')
      const sev = url.searchParams.get('severity')
      if (lang) results = results.filter((r) => r.language === lang)
      if (sev) results = results.filter((r) => r.severity === sev)
      const limit = Number(url.searchParams.get('limit') ?? 1000)
      results = results.slice(0, limit)
      return new Response(JSON.stringify(results), { headers })
    }

    if (url.pathname === '/api/summary') {
      const results = this.db.queryAll()
      const summary: ValidationSummary = buildSummary(results, 0)
      return new Response(JSON.stringify(summary), { headers })
    }

    if (url.pathname === '/api/performance/trends') {
      const results = this.db.queryAll()
      const metrics = computeMetrics(results)
      return new Response(JSON.stringify(metrics), { headers })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers,
    })
  }
}
