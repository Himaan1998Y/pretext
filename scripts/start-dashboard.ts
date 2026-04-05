#!/usr/bin/env bun
// Dashboard server start script.
//
// Starts the measurement-validator HTTP + WebSocket dashboard server.
// Keeps the process alive and serves the web UI on the configured port.
//
// Usage:
//   bun run scripts/start-dashboard.ts [options]
//
// Options:
//   --port=<n>     HTTP port (default: 3000)
//   --host=<addr>  Bind address (default: 127.0.0.1)
//   --db=<path>    SQLite database path (default: .measurement-results.db)
//   --open         Open dashboard in default browser after start

import { parseArgs } from 'node:util'
import { execSync } from 'node:child_process'
import { ResultsDatabase } from '../src/measurement-validator/results-database.js'
import { DashboardServer } from '../src/measurement-validator/dashboard-server.js'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    port: { type: 'string', default: '3000' },
    host: { type: 'string', default: '127.0.0.1' },
    db: { type: 'string', default: '.measurement-results.db' },
    open: { type: 'boolean', default: false },
  },
  strict: false,
})

const port = Number(args['port'] ?? 3000)
const host = (args['host'] as string) ?? '127.0.0.1'
const dbPath = (args['db'] as string) ?? '.measurement-results.db'

const db = new ResultsDatabase(dbPath)
const server = new DashboardServer({ port, host, db })

server.start()

if (args['open']) {
  const url = `http://${host}:${port}/dashboard`
  try {
    const platform = process.platform
    if (platform === 'darwin') execSync(`open "${url}"`)
    else if (platform === 'win32') execSync(`start "" "${url}"`)
    else execSync(`xdg-open "${url}"`)
  } catch {
    // Browser open is best-effort
  }
}

process.on('SIGINT', () => {
  console.log('\nStopping dashboard server…')
  server.stop()
  db.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  server.stop()
  db.close()
  process.exit(0)
})
