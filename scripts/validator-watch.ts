#!/usr/bin/env bun
// validator-watch.ts — watch benchmark/accuracy snapshot files and re-run
// regression detection whenever a file changes.
//
// Usage:
//   bun run scripts/validator-watch.ts [--browsers=chrome,safari,firefox]
//                                      [--slack-webhook=<url>]
//
// Flags:
//   --browsers=B    Comma-separated list of browsers to watch (default: chrome)
//   --slack-webhook=URL  Send notifications via Slack when regressions are found

import { watch } from 'node:fs'
import { join } from 'node:path'
import {
  detectRegressions,
  formatRegressionReport,
} from '../src/measurement-validator/regression-detector.js'
import {
  createSlackNotifierFromEnv,
  SlackNotifier,
} from '../src/measurement-validator/slack-notifier.js'
import type { BrowserName } from '../src/measurement-validator/types.js'

function parseFlag(name: string): string | null {
  const prefix = `--${name}=`
  const arg = process.argv.find(v => v.startsWith(prefix))
  return arg !== undefined ? arg.slice(prefix.length) : null
}

const browsersArg = parseFlag('browsers') ?? 'chrome'
const browsers = browsersArg.split(',').map(b => b.trim()) as BrowserName[]
const slackUrl = parseFlag('slack-webhook')
const notifier: SlackNotifier | null =
  slackUrl != null ? new SlackNotifier(slackUrl) : createSlackNotifierFromEnv()

const repoRoot = join(import.meta.dir, '..')
const watchPaths = [
  join(repoRoot, 'accuracy'),
  join(repoRoot, 'benchmarks'),
]

let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function runCheck(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Running regression check for: ${browsers.join(', ')}`)
  const report = await detectRegressions(browsers)
  const text = formatRegressionReport(report)
  console.log(text)

  if (notifier != null && (report.hasBlocker || report.performanceRegressions.length > 0)) {
    try {
      await notifier.notifyRegressionReport(report)
      console.log('Slack notification sent.')
    } catch (err) {
      console.error('Failed to send Slack notification:', err)
    }
  }
}

function scheduleCheck(): void {
  if (debounceTimer != null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    runCheck().catch(err => console.error('Regression check failed:', err))
  }, 500)
}

// Run once immediately on start.
await runCheck()

// Watch the accuracy and benchmarks directories for changes.
for (const watchPath of watchPaths) {
  try {
    watch(watchPath, { recursive: false }, (_event, filename) => {
      if (filename?.endsWith('.json')) {
        console.log(`[watch] Changed: ${watchPath}/${filename}`)
        scheduleCheck()
      }
    })
    console.log(`Watching ${watchPath}`)
  } catch {
    // Directory may not exist — silently skip.
  }
}

console.log('Press Ctrl+C to stop.')
