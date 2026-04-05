#!/usr/bin/env bun
// validator-dashboard.ts — start the measurement-validator HTTP dashboard.
//
// Usage:
//   bun run scripts/validator-dashboard.ts [--port=3001] [--host=127.0.0.1] [--no-db]
//
// Flags:
//   --port=N        Port to listen on (default 3001)
//   --host=H        Hostname/IP to bind (default 127.0.0.1)
//   --no-db         Disable SQLite persistence (serve read-only data only)

import { DashboardServer } from '../src/measurement-validator/dashboard-server.js'

function parseFlag(name: string): string | null {
  const prefix = `--${name}=`
  const arg = process.argv.find(v => v.startsWith(prefix))
  return arg !== undefined ? arg.slice(prefix.length) : null
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

const port = Number(parseFlag('port') ?? 3001)
const host = parseFlag('host') ?? '127.0.0.1'
const enableDatabase = !hasFlag('no-db')

const server = new DashboardServer({ port, host, enableDatabase })
server.start()

process.on('SIGINT', () => {
  console.log('\nShutting down dashboard server…')
  server.stop()
  process.exit(0)
})
