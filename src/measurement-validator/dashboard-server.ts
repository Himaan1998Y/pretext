// HTTP + WebSocket dashboard server for the measurement-validator.
//
// Exposes a REST API for validation results and a simple HTML web UI.
// WebSocket clients receive real-time push events when new runs are stored.

import type { DatabaseQueryOptions, ValidationRun } from './types.js'
import type { ResultsDatabase } from './results-database.js'

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Measurement Validator Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; }
    header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 18px; font-weight: 600; }
    .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #3fb950; }
    .status-dot.disconnected { background: #f85149; }
    main { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
    .stat-card .label { font-size: 12px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .stat-card .value { font-size: 28px; font-weight: 700; }
    .stat-card .value.ok { color: #3fb950; }
    .stat-card .value.warning { color: #d29922; }
    .stat-card .value.critical { color: #f85149; }
    section h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #e6edf3; }
    .filters { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .filters select, .filters input { background: #21262d; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; padding: 6px 10px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead th { text-align: left; padding: 10px 12px; border-bottom: 1px solid #30363d; color: #8b949e; font-weight: 500; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
    tbody tr { border-bottom: 1px solid #21262d; }
    tbody tr:hover { background: #161b22; }
    tbody td { padding: 10px 12px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }
    .badge.ok { background: rgba(63,185,80,0.15); color: #3fb950; }
    .badge.warning { background: rgba(210,153,34,0.15); color: #d29922; }
    .badge.critical { background: rgba(248,81,73,0.15); color: #f85149; }
    .empty { text-align: center; padding: 40px; color: #8b949e; }
    #ws-log { font-size: 12px; color: #8b949e; margin-top: 8px; }
  </style>
</head>
<body>
  <header>
    <div class="status-dot disconnected" id="ws-dot"></div>
    <h1>Measurement Validator Dashboard</h1>
    <span id="ws-log">Connecting…</span>
  </header>
  <main>
    <div class="stats-grid">
      <div class="stat-card"><div class="label">Total Runs</div><div class="value" id="stat-runs">—</div></div>
      <div class="stat-card"><div class="label">Total Results</div><div class="value" id="stat-results">—</div></div>
      <div class="stat-card"><div class="label">Avg Pass Rate</div><div class="value ok" id="stat-pass">—</div></div>
      <div class="stat-card"><div class="label">Critical Issues</div><div class="value" id="stat-critical">—</div></div>
    </div>
    <section>
      <h2>Recent Results</h2>
      <div class="filters">
        <select id="filter-lang"><option value="">All Languages</option></select>
        <select id="filter-severity"><option value="">All Severities</option><option value="ok">OK</option><option value="warning">Warning</option><option value="critical">Critical</option></select>
        <input type="text" id="filter-search" placeholder="Search text…" />
      </div>
      <table>
        <thead><tr><th>Language</th><th>Font</th><th>Text</th><th>Pretext</th><th>DOM</th><th>Delta</th><th>Severity</th></tr></thead>
        <tbody id="results-body"></tbody>
      </table>
      <div class="empty" id="empty-state" style="display:none">No results yet</div>
    </section>
  </main>
  <script>
    const API = '';
    let allResults = [];

    async function loadStats() {
      try {
        const r = await fetch(API + '/api/summary');
        const d = await r.json();
        document.getElementById('stat-runs').textContent = d.totalRuns ?? '—';
        document.getElementById('stat-results').textContent = d.totalResults ?? '—';
        const pr = (d.avgPassRate ?? 0) * 100;
        const el = document.getElementById('stat-pass');
        el.textContent = pr.toFixed(1) + '%';
        el.className = 'value ' + (pr >= 99 ? 'ok' : pr >= 95 ? 'warning' : 'critical');
        const critEl = document.getElementById('stat-critical');
        critEl.textContent = d.criticalCount ?? '—';
        critEl.className = 'value ' + ((d.criticalCount ?? 0) > 0 ? 'critical' : 'ok');

        const langSel = document.getElementById('filter-lang');
        (d.languages || []).forEach(l => {
          if (!langSel.querySelector('[value="' + l + '"]')) {
            const o = document.createElement('option');
            o.value = l; o.textContent = l;
            langSel.appendChild(o);
          }
        });
      } catch (e) { console.error('Failed to load stats', e); }
    }

    async function loadResults() {
      try {
        const lang = document.getElementById('filter-lang').value;
        const sev = document.getElementById('filter-severity').value;
        const params = new URLSearchParams();
        if (lang) params.set('language', lang);
        if (sev) params.set('severity', sev);
        params.set('limit', '200');
        const r = await fetch(API + '/api/results?' + params.toString());
        allResults = await r.json();
        renderResults();
      } catch (e) { console.error('Failed to load results', e); }
    }

    function renderResults() {
      const search = document.getElementById('filter-search').value.toLowerCase();
      const rows = allResults.filter(r =>
        !search || r.text.toLowerCase().includes(search) || r.language.toLowerCase().includes(search)
      );
      const tbody = document.getElementById('results-body');
      tbody.innerHTML = rows.map(r => \`
        <tr>
          <td>\${r.language}</td>
          <td>\${r.font}</td>
          <td title="\${r.text}">\${r.text.length > 40 ? r.text.slice(0, 40) + '…' : r.text}</td>
          <td>\${r.pretextWidth.toFixed(2)}px</td>
          <td>\${r.domWidth.toFixed(2)}px</td>
          <td>\${r.deltaPercent.toFixed(2)}%</td>
          <td><span class="badge \${r.severity}">\${r.severity}</span></td>
        </tr>
      \`).join('');
      document.getElementById('empty-state').style.display = rows.length === 0 ? '' : 'none';
    }

    document.getElementById('filter-lang').addEventListener('change', loadResults);
    document.getElementById('filter-severity').addEventListener('change', loadResults);
    document.getElementById('filter-search').addEventListener('input', renderResults);

    function connectWs() {
      const wsUrl = 'ws://' + location.host + '/ws/results';
      const ws = new WebSocket(wsUrl);
      const dot = document.getElementById('ws-dot');
      const log = document.getElementById('ws-log');
      ws.onopen = () => { dot.className = 'status-dot'; log.textContent = 'Live'; };
      ws.onclose = () => { dot.className = 'status-dot disconnected'; log.textContent = 'Disconnected — retrying…'; setTimeout(connectWs, 3000); };
      ws.onerror = () => { dot.className = 'status-dot disconnected'; };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'run_complete') { loadStats(); loadResults(); }
        } catch {}
      };
    }

    loadStats();
    loadResults();
    connectWs();
  </script>
</body>
</html>`

export type DashboardServerConfig = {
  port?: number
  host?: string
  db: ResultsDatabase
}

type WsClient = {
  send: (msg: string) => void
  close: () => void
}

export class DashboardServer {
  private config: DashboardServerConfig
  private wsClients: Set<WsClient> = new Set()
  private server: ReturnType<typeof Bun.serve> | null = null

  constructor(config: DashboardServerConfig) {
    this.config = config
  }

  start(): void {
    const { db } = this.config
    const port = this.config.port ?? 3000
    const host = this.config.host ?? '127.0.0.1'
    const clients = this.wsClients

    this.server = Bun.serve({
      port,
      hostname: host,
      fetch(req, server) {
        const url = new URL(req.url)

        // WebSocket upgrade
        if (url.pathname === '/ws/results') {
          const upgraded = server.upgrade(req)
          if (upgraded) return undefined
          return new Response('WebSocket upgrade failed', { status: 400 })
        }

        // CORS headers for API
        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Content-Type': 'application/json',
        }

        if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

        if (url.pathname === '/api/results') {
          const opts: DatabaseQueryOptions = {}
          const lang = url.searchParams.get('language')
          const sev = url.searchParams.get('severity')
          const since = url.searchParams.get('since')
          const limit = url.searchParams.get('limit')
          const offset = url.searchParams.get('offset')
          if (lang) opts.language = lang
          if (sev === 'ok' || sev === 'warning' || sev === 'critical') opts.severity = sev
          if (since) opts.since = Number(since)
          if (limit) opts.limit = Number(limit)
          if (offset) opts.offset = Number(offset)
          const results = db.queryResults(opts)
          return new Response(JSON.stringify(results), { headers: corsHeaders })
        }

        if (url.pathname === '/api/runs') {
          const limit = Number(url.searchParams.get('limit') ?? 50)
          const runs = db.queryRuns(limit)
          return new Response(JSON.stringify(runs), { headers: corsHeaders })
        }

        if (url.pathname.startsWith('/api/runs/')) {
          const id = url.pathname.slice('/api/runs/'.length)
          const run = db.getRunById(id)
          if (!run) return new Response('Not found', { status: 404 })
          return new Response(JSON.stringify(run), { headers: corsHeaders })
        }

        if (url.pathname === '/api/summary') {
          const stats = db.getStatistics()
          return new Response(JSON.stringify(stats), { headers: corsHeaders })
        }

        if (url.pathname === '/api/performance/trends') {
          const lang = url.searchParams.get('language') ?? 'english'
          const days = Number(url.searchParams.get('days') ?? 30)
          const trends = db.getLanguageTrends(lang, days)
          return new Response(JSON.stringify(trends), { headers: corsHeaders })
        }

        // Dashboard UI
        if (url.pathname === '/' || url.pathname === '/dashboard') {
          return new Response(DASHBOARD_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }

        return new Response('Not found', { status: 404 })
      },
      websocket: {
        open(ws) {
          clients.add(ws)
        },
        close(ws) {
          clients.delete(ws)
        },
        message() {
          // Clients don't send messages in this protocol
        },
      },
    })

    console.log(`Dashboard server running at http://${host}:${port}`)
    console.log(`  API: http://${host}:${port}/api/results`)
    console.log(`  UI:  http://${host}:${port}/dashboard`)
    console.log(`  WS:  ws://${host}:${port}/ws/results`)
  }

  /** Notify all connected WebSocket clients that a new run is available. */
  broadcast(event: { type: string; runId?: string }): void {
    const msg = JSON.stringify(event)
    for (const client of this.wsClients) {
      try {
        client.send(msg)
      } catch {
        this.wsClients.delete(client)
      }
    }
  }

  /** Store a new validation run and notify WebSocket clients. */
  publishRun(run: ValidationRun): void {
    this.config.db.insertRun(run)
    this.broadcast({ type: 'run_complete', runId: run.id })
  }

  stop(): void {
    if (this.server) {
      this.server.stop()
      this.server = null
    }
  }

  get url(): string {
    const port = this.config.port ?? 3000
    const host = this.config.host ?? '127.0.0.1'
    return `http://${host}:${port}`
  }
}
