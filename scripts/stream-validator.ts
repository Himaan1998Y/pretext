#!/usr/bin/env bun
// Stream validator CLI.
//
// Runs validation and streams results to stdout in real time as each
// language measurement completes. Useful for CI pipelines where you want
// progressive output rather than a single batch report.
//
// Usage:
//   bun run scripts/stream-validator.ts [options]
//
// Options:
//   --language=<name>   Only validate a specific language
//   --format=<ndjson|text>  Output format (default: text)
//   --baseline=<path>   Performance baseline path

import { parseArgs } from 'node:util'
import {
  loadBaseline,
  detectRegressions,
  createTrackingSession,
  recordSample,
  finalizeSession,
  baselineKey,
} from '../src/measurement-validator/performance-tracker.js'
import type { PerformanceMetrics } from '../src/measurement-validator/types.js'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    language: { type: 'string' },
    format: { type: 'string', default: 'text' },
    baseline: { type: 'string', default: '.measurement-baseline.json' },
  },
  strict: false,
})

const LANGUAGES = args['language'] ? [args['language'] as string] : ['english', 'arabic', 'chinese', 'japanese', 'thai']
const FONT = '16px Inter, sans-serif'
const FORMAT = (args['format'] as string) ?? 'text'

// Synthetic timing ranges derived from observed pretext benchmark medians.
// Replace with real canvas timing when integrating with browser automation.
const SIM_SAMPLE_COUNT = 20
const SIM_PREPARE_BASE_MS = 0.8
const SIM_PREPARE_JITTER_MS = 0.4
const SIM_LAYOUT_BASE_MS = 0.02
const SIM_LAYOUT_JITTER_MS = 0.02

function emit(data: unknown) {
  if (FORMAT === 'ndjson') {
    console.log(JSON.stringify(data))
  } else {
    if (typeof data === 'object' && data !== null && 'type' in data) {
      const d = data as Record<string, unknown>
      if (d['type'] === 'start') {
        console.log(`\nStreaming measurement validation`)
        console.log(`Languages: ${LANGUAGES.join(', ')}`)
        console.log(`Baseline: ${args['baseline'] ?? 'none'}\n`)
      } else if (d['type'] === 'result') {
        const m = d['metrics'] as PerformanceMetrics
        const change = d['change'] as string
        const status = d['status'] as string
        const icon = status === 'ok' ? '✅' : status === 'warning' ? '🟡' : '🔴'
        console.log(`${icon}  ${m.language.padEnd(12)} ${m.totalMs.toFixed(2).padStart(7)}ms avg  ${change}`)
      } else if (d['type'] === 'complete') {
        const regressions = d['regressions'] as Array<{ severity: string }>
        console.log(`\nDone. ${regressions.length} regressions detected.`)
        if (regressions.some((r) => r.severity === 'critical')) {
          console.error('Critical regressions found — build should fail.')
        }
      }
    }
  }
}

async function main() {
  const baseline = loadBaseline(args['baseline'] as string)
  emit({ type: 'start', timestamp: Date.now(), languages: LANGUAGES })

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
    const metrics = finalizeSession(session)
    current.push(metrics)

    const base = baseline?.metrics[baselineKey(lang, FONT)]
    const changePercent = base && base.avgTotalMs > 0
      ? ((metrics.totalMs - base.avgTotalMs) / base.avgTotalMs * 100)
      : null
    const change = changePercent !== null
      ? (changePercent > 0 ? `+${changePercent.toFixed(1)}% vs baseline` : `${changePercent.toFixed(1)}% vs baseline`)
      : 'no baseline'
    const status = changePercent === null ? 'ok'
      : changePercent >= 50 ? 'critical'
        : changePercent >= 20 ? 'warning' : 'ok'

    emit({ type: 'result', metrics, change, status, timestamp: Date.now() })

    // Allow other async work between languages
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  const regressions = baseline ? detectRegressions(current, baseline) : []
  emit({ type: 'complete', timestamp: Date.now(), regressions, total: current.length })

  if (regressions.some((r) => r.severity === 'critical')) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
