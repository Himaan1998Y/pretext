#!/usr/bin/env bun
// validator-trends.ts — print performance trends from the benchmark snapshots.
//
// Usage:
//   bun run scripts/validator-trends.ts [--browser=chrome] [--warn=10] [--critical=25]
//
// Flags:
//   --browser=B     chrome | safari | firefox (default: chrome)
//   --warn=N        Percent degradation threshold for warnings (default 10)
//   --critical=N    Percent degradation threshold for critical flags (default 25)
//   --json          Emit JSON instead of human-readable text

import {
  formatPerformanceReport,
  trackPerformance,
} from '../src/measurement-validator/performance-tracker.js'
import type { BrowserName } from '../src/measurement-validator/types.js'

function parseFlag(name: string): string | null {
  const prefix = `--${name}=`
  const arg = process.argv.find(v => v.startsWith(prefix))
  return arg !== undefined ? arg.slice(prefix.length) : null
}

const browser = (parseFlag('browser') ?? 'chrome') as BrowserName
const warnPct = Number(parseFlag('warn') ?? 10)
const criticalPct = Number(parseFlag('critical') ?? 25)
const emitJson = process.argv.includes('--json')

const report = await trackPerformance(browser, { warnPct, criticalPct })

if (emitJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(formatPerformanceReport(report))
  if (report.regressionCount > 0) {
    process.exit(1)
  }
}
