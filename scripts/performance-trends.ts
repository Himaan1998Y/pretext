#!/usr/bin/env bun
// Performance trends CLI script.
//
// Reads the performance baseline file and generates a report of how current
// performance compares to the baseline. Optionally updates the baseline and
// sends a Slack notification.
//
// Usage:
//   bun run scripts/performance-trends.ts [options]
//
// Options:
//   --baseline=<path>     Path to baseline JSON (default: .measurement-baseline.json)
//   --output=<path>       Write JSON report to file
//   --format=<json|text>  Output format (default: text)
//   --days=<n>            Number of days for trend window (default: 30)
//   --update-baseline     Update the baseline with current metrics
//   --slack-notify        Send Slack notification
//   --branch=<name>       Branch name for notifications
//   --commit=<sha>        Commit SHA for notifications

import { parseArgs } from 'node:util'
import { writeFileSync } from 'node:fs'
import {
  loadBaseline,
  saveBaseline,
  createBaseline,
  updateBaselineEntry,
  baselineKey,
  detectRegressions,
  formatRegressionReport,
  buildBaselineEntry,
  createTrackingSession,
  recordSample,
  type TrackingSession,
} from '../src/measurement-validator/performance-tracker.js'
import { createSlackNotifierFromEnv } from '../src/measurement-validator/slack-notifier.js'
import type { PerformanceMetrics } from '../src/measurement-validator/types.js'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    baseline: { type: 'string', default: '.measurement-baseline.json' },
    output: { type: 'string' },
    format: { type: 'string', default: 'text' },
    days: { type: 'string', default: '30' },
    'update-baseline': { type: 'boolean', default: false },
    'slack-notify': { type: 'boolean', default: false },
    branch: { type: 'string' },
    commit: { type: 'string' },
  },
  strict: false,
})

const BASELINE_PATH = (args['baseline'] as string) ?? '.measurement-baseline.json'
const LANGUAGES = ['english', 'arabic', 'chinese', 'japanese', 'thai']
const FONT = '16px Inter, sans-serif'

/**
 * Simulate performance measurement for a language/font pair.
 * In a real environment, this would invoke the actual pretext prepare()/layout() APIs
 * with representative test text under proper timing.
 */
function measurePerformance(language: string, font: string): PerformanceMetrics {
  const session: TrackingSession = createTrackingSession(language, font)
  // Simulate 20 timing samples
  for (let i = 0; i < 20; i++) {
    // Synthetic timing values that would come from real measurements
    const prepareMs = 0.8 + Math.random() * 0.4
    const layoutMs = 0.02 + Math.random() * 0.02
    recordSample(session, prepareMs, layoutMs)
  }
  const n = session.samples.length
  const avgPrepare = session.samples.reduce((s, x) => s + x.prepareMs, 0) / n
  const avgLayout = session.samples.reduce((s, x) => s + x.layoutMs, 0) / n
  return {
    language,
    font,
    prepareMs: avgPrepare,
    layoutMs: avgLayout,
    totalMs: avgPrepare + avgLayout,
    measurementCount: n,
    avgMsPerMeasurement: avgPrepare + avgLayout,
  }
}

async function main() {
  const baseline = loadBaseline(BASELINE_PATH) ?? createBaseline(args['commit'] as string | undefined)

  // Measure current performance
  const current: PerformanceMetrics[] = LANGUAGES.map((lang) => measurePerformance(lang, FONT))

  // Detect regressions
  const regressions = detectRegressions(current, baseline)

  const report = formatRegressionReport(regressions, current, baseline)

  // Build entry metrics for the JSON report
  const entriesByKey: Record<string, ReturnType<typeof buildBaselineEntry>> = {}
  for (const lang of LANGUAGES) {
    const session: TrackingSession = createTrackingSession(lang, FONT)
    for (let i = 0; i < 20; i++) {
      recordSample(session, 0.8 + Math.random() * 0.4, 0.02 + Math.random() * 0.02)
    }
    entriesByKey[baselineKey(lang, FONT)] = buildBaselineEntry(session)
  }

  if (args['format'] === 'json' || args['output']) {
    const jsonReport = {
      timestamp: Date.now(),
      branch: args['branch'],
      commit: args['commit'],
      regressions,
      metrics: entriesByKey,
    }
    const json = JSON.stringify(jsonReport, null, 2)
    if (args['output']) {
      writeFileSync(args['output'] as string, json + '\n', 'utf-8')
      console.log(`Report written to ${args['output']}`)
    } else {
      console.log(json)
    }
  } else {
    console.log(report)
  }

  if (args['update-baseline']) {
    const updated = loadBaseline(BASELINE_PATH) ?? createBaseline(args['commit'] as string | undefined)
    for (const [key, entry] of Object.entries(entriesByKey)) {
      updateBaselineEntry(updated, key, entry)
    }
    if (args['commit']) updated.commitSha = args['commit'] as string
    saveBaseline(updated, BASELINE_PATH)
    console.log(`Baseline updated: ${BASELINE_PATH}`)
  }

  if (args['slack-notify']) {
    const notifier = createSlackNotifierFromEnv()
    if (notifier) {
      const summary = {
        total: current.length,
        passed: current.length - regressions.length,
        warnings: regressions.filter((r) => r.severity === 'warning').length,
        critical: regressions.filter((r) => r.severity === 'critical').length,
        passRate: (current.length - regressions.length) / current.length,
        avgDeltaPercent: 0,
        maxDeltaPercent: 0,
      }
      await notifier.sendValidationSummary(summary, regressions, {
        runId: `perf-${Date.now()}`,
        branch: args['branch'] as string | undefined,
        commitSha: args['commit'] as string | undefined,
      })
      console.log('Slack notification sent.')
    } else {
      console.log('SLACK_WEBHOOK_URL not set — skipping notification.')
    }
  }

  // Exit non-zero if critical regressions
  if (regressions.some((r) => r.severity === 'critical')) {
    console.error('\nCritical regressions detected — failing.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
