#!/usr/bin/env bun
// Measurement validator CLI.
//
// Usage:
//   bun run validator                        # run all built-in fixtures
//   bun run validator --language en          # run only English fixtures
//   bun run validator --report csv           # print CSV to stdout
//   bun run validator --report markdown      # print Markdown to stdout
//   bun run validator --report html          # print HTML to stdout
//   bun run validator --report json          # print JSON to stdout
//   bun run validator --filter exact         # show only matching severity rows
//
// Exit codes: 0 = all passed, 1 = at least one non-exact result

import { compare } from '../src/measurement-validator/comparator.js'
import {
  buildReport,
  printConsoleReport,
  toCSV,
  toHTML,
  toJSON,
  toMarkdown,
} from '../src/measurement-validator/report-generator.js'
import { fixtures } from '../src/measurement-validator/test-suite.js'
import type { DivergenceSeverity } from '../src/measurement-validator/types.js'

// ─── Arg parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(name)
  return idx !== -1 ? args[idx + 1] : undefined
}

const language = getFlag('--language')
const reportFormat = getFlag('--report') // csv | markdown | html | json
const filterSeverity = getFlag('--filter') as DivergenceSeverity | undefined

// ─── Collect samples ─────────────────────────────────────────────────────────

const allFixtures = language !== undefined
  ? (fixtures[language] ?? [])
  : Object.values(fixtures).flat()

if (allFixtures.length === 0) {
  const available = Object.keys(fixtures).join(', ')
  console.error(`No fixtures found for language "${language ?? ''}". Available: ${available}`)
  process.exit(1)
}

// ─── Run comparisons ──────────────────────────────────────────────────────────

const results = allFixtures.map(compare)

// Apply optional severity filter
const filtered = filterSeverity !== undefined
  ? results.filter((r) => r.severity === filterSeverity)
  : results

const report = buildReport(filtered)

// ─── Output ───────────────────────────────────────────────────────────────────

switch (reportFormat) {
  case 'csv':
    process.stdout.write(toCSV(report))
    break
  case 'markdown':
    process.stdout.write(toMarkdown(report))
    break
  case 'html':
    process.stdout.write(toHTML(report))
    break
  case 'json':
    process.stdout.write(toJSON(report) + '\n')
    break
  default:
    printConsoleReport(report)
}

// Exit 1 if any failures
process.exit(report.failed > 0 ? 1 : 0)
