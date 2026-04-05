#!/usr/bin/env bun
// validator-regression-detect.ts — run regression detection and report results.
//
// Usage:
//   bun run scripts/validator-regression-detect.ts [--browsers=chrome,safari,firefox]
//                                                  [--json]
//                                                  [--slack-webhook=<url>]
//                                                  [--fail-on-critical]
//
// Flags:
//   --browsers=B        Comma-separated browser list (default: chrome)
//   --warn=N            Perf warning threshold in % (default 10)
//   --critical=N        Perf critical threshold in % (default 25)
//   --json              Emit JSON output instead of human-readable text
//   --slack-webhook=URL Send Slack notification
//   --fail-on-critical  Exit with code 1 when critical regressions are found

import {
  detectRegressions,
  formatRegressionReport,
} from '../src/measurement-validator/regression-detector.js'
import {
  createSlackNotifierFromEnv,
  SlackNotifier,
} from '../src/measurement-validator/slack-notifier.js'
import { ResultsDatabase } from '../src/measurement-validator/results-database.js'
import type { BrowserName } from '../src/measurement-validator/types.js'

function parseFlag(name: string): string | null {
  const prefix = `--${name}=`
  const arg = process.argv.find(v => v.startsWith(prefix))
  return arg !== undefined ? arg.slice(prefix.length) : null
}

const browsersArg = parseFlag('browsers') ?? 'chrome'
const browsers = browsersArg.split(',').map(b => b.trim()) as BrowserName[]
const warnPct = Number(parseFlag('warn') ?? 10)
const criticalPct = Number(parseFlag('critical') ?? 25)
const emitJson = process.argv.includes('--json')
const failOnCritical = process.argv.includes('--fail-on-critical')
const slackUrl = parseFlag('slack-webhook')

const report = await detectRegressions(browsers, { perfWarnPct: warnPct, perfCriticalPct: criticalPct })

if (emitJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(formatRegressionReport(report))
}

// Persist to SQLite if database is available
try {
  const db = new ResultsDatabase()
  for (const browser of browsers) {
    db.insertRun({
      runAt: report.generatedAt,
      browser,
      accuracyTotal: 0,
      accuracyMatches: 0,
      benchmarkJson: '{}',
      regressionJson: JSON.stringify(report),
      tags: `browser:${browser}`,
    })
  }
  db.close()
} catch {
  // Non-fatal — DB may not be set up in all environments.
}

// Send Slack notification if configured.
const notifier: SlackNotifier | null =
  slackUrl != null ? new SlackNotifier(slackUrl) : createSlackNotifierFromEnv()

if (notifier != null) {
  try {
    await notifier.notifyRegressionReport(report)
  } catch (err) {
    console.error('Slack notification failed:', err)
  }
}

if (failOnCritical && report.hasBlocker) {
  process.exit(1)
}
