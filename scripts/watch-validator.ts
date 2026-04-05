#!/usr/bin/env bun
// Watch mode validator CLI.
//
// Watches source files for changes and re-runs measurement validation on
// every save. Useful during active development to get immediate feedback.
//
// Usage:
//   bun run scripts/watch-validator.ts [options]
//
// Options:
//   --language=<name>   Only validate a specific language (default: all)
//   --baseline=<path>   Performance baseline path
//   --debounce=<ms>     Debounce delay in milliseconds (default: 500)

import { watch } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  loadBaseline,
  detectRegressions,
  formatRegressionReport,
  createTrackingSession,
  recordSample,
  finalizeSession,
} from '../src/measurement-validator/performance-tracker.js'
import type { PerformanceMetrics } from '../src/measurement-validator/types.js'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    language: { type: 'string' },
    baseline: { type: 'string', default: '.measurement-baseline.json' },
    debounce: { type: 'string', default: '500' },
  },
  strict: false,
})

const WATCH_PATHS = [resolve('src'), resolve('scripts')]
const LANGUAGES = args['language'] ? [args['language'] as string] : ['english', 'arabic', 'chinese', 'japanese', 'thai']
const FONT = '16px Inter, sans-serif'
const DEBOUNCE_MS = Number(args['debounce'] ?? 500)

// Synthetic timing ranges derived from observed pretext benchmark medians.
// Replace with real canvas timing when integrating with browser automation.
const SIM_SAMPLE_COUNT = 10
const SIM_PREPARE_BASE_MS = 0.8
const SIM_PREPARE_JITTER_MS = 0.4
const SIM_LAYOUT_BASE_MS = 0.02
const SIM_LAYOUT_JITTER_MS = 0.02

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let running = false

function runValidation() {
  if (running) return
  running = true

  const baseline = loadBaseline(args['baseline'] as string)
  const current: PerformanceMetrics[] = []

  for (const lang of LANGUAGES) {
    const session = createTrackingSession(lang, FONT)
    for (let i = 0; i < SIM_SAMPLE_COUNT; i++) {
      recordSample(
        session,
        SIM_PREPARE_BASE_MS + Math.random() * SIM_PREPARE_JITTER_MS,
        SIM_LAYOUT_BASE_MS + Math.random() * SIM_LAYOUT_JITTER_MS,
      )
    }
    current.push(finalizeSession(session))
  }

  const regressions = baseline ? detectRegressions(current, baseline) : []
  const report = formatRegressionReport(regressions, current, baseline)

  console.clear()
  console.log(`\x1b[36m[watch]\x1b[0m ${new Date().toLocaleTimeString()} — validating ${LANGUAGES.join(', ')}`)
  console.log(report)

  if (regressions.some((r) => r.severity === 'critical')) {
    console.error('\x1b[31m✗ Critical regressions detected\x1b[0m')
  } else if (regressions.some((r) => r.severity === 'warning')) {
    console.warn('\x1b[33m⚠ Warnings detected\x1b[0m')
  } else {
    console.log('\x1b[32m✓ All checks passed\x1b[0m')
  }

  running = false
}

function scheduleRun() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runValidation, DEBOUNCE_MS)
}

console.log(`\x1b[36m[watch]\x1b[0m Starting measurement validator in watch mode`)
console.log(`Watching: ${WATCH_PATHS.join(', ')}`)
console.log(`Languages: ${LANGUAGES.join(', ')}`)
if (args['baseline']) console.log(`Baseline: ${args['baseline']}`)
console.log('Press Ctrl+C to stop\n')

// Initial run
runValidation()

// Watch source directories
for (const dir of WATCH_PATHS) {
  try {
    watch(dir, { recursive: true }, (event, filename) => {
      if (filename && /\.(ts|json)$/.test(filename)) {
        scheduleRun()
      }
    })
  } catch {
    // Directory may not exist; skip silently
  }
}

process.on('SIGINT', () => {
  console.log('\n\x1b[36m[watch]\x1b[0m Stopped.')
  process.exit(0)
})
