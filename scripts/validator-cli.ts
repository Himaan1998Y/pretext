#!/usr/bin/env bun
// Measurement Validator CLI — Phase 4 enhanced tool.
//
// Usage:
//   bun run scripts/validator-cli.ts validate [options]
//   bun run scripts/validator-cli.ts report   [options]
//   bun run scripts/validator-cli.ts watch    [options]
//   bun run scripts/validator-cli.ts stream   [options]
//   bun run scripts/validator-cli.ts trends   [options]
//   bun run scripts/validator-cli.ts dashboard [options]
//   bun run scripts/validator-cli.ts benchmark --update-baseline
//
// Run `bun run scripts/validator-cli.ts --help` for full reference.

import { readFileSync, writeFileSync, existsSync, watchFile } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateSamples,
  buildSummary,
  exportToCsv,
  exportToMarkdown,
  exportToHtml,
  computeMetrics,
  metricsToBaseline,
  compareToBaseline,
  detectRegressions,
  summarizeRegressions,
  MeasurementDatabase,
  DashboardServer,
} from '../src/measurement-validator/index.js'
import type {
  BaselineEntry,
  Language,
  MeasurementResult,
  ReportFormat,
  Severity,
} from '../src/measurement-validator/types.js'

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

type Args = {
  command: string
  language: string | null
  severity: Severity | null
  report: ReportFormat
  output: string | null
  input: string | null
  port: number
  dbPath: string
  baselinePath: string
  watch: boolean
  stream: boolean
  limit: number
  help: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: argv[2] ?? 'validate',
    language: null,
    severity: null,
    report: 'json',
    output: null,
    input: null,
    port: 3000,
    dbPath: 'measurements.db',
    baselinePath: 'performance-baseline.json',
    watch: false,
    stream: false,
    limit: 1000,
    help: false,
  }
  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--help' || arg === '-h') { args.help = true; continue }
    if (arg === '--watch') { args.watch = true; continue }
    if (arg === '--stream') { args.stream = true; continue }
    const [key, val] = arg.split('=')
    if (!key || val === undefined) continue
    switch (key) {
      case '--language': args.language = val; break
      case '--severity': args.severity = val as Severity; break
      case '--report':   args.report = val as ReportFormat; break
      case '--output':   args.output = val; break
      case '--input':    args.input = val; break
      case '--port':     args.port = Number(val); break
      case '--db':       args.dbPath = val; break
      case '--baseline': args.baselinePath = val; break
      case '--limit':    args.limit = Number(val); break
    }
  }
  return args
}

// ---------------------------------------------------------------------------
// Sample data helpers
// ---------------------------------------------------------------------------

const SAMPLE_TEXTS: Array<{ text: string; language: Language }> = [
  { text: 'Hello world, this is a sample English sentence.', language: 'en' },
  { text: 'مرحباً بالعالم، هذه جملة نموذجية باللغة العربية.', language: 'ar' },
  { text: '你好世界，这是一个中文示例句子。', language: 'zh' },
  { text: 'こんにちは世界、これは日本語のサンプル文です。', language: 'ja' },
  { text: '안녕하세요 세계, 이것은 한국어 샘플 문장입니다.', language: 'ko' },
  { text: 'สวัสดีชาวโลก นี่คือประโยคตัวอย่างภาษาไทย', language: 'th' },
  { text: 'नमस्ते दुनिया, यह एक हिंदी नमूना वाक्य है।', language: 'hi' },
  { text: 'Привет мир, это образец предложения на русском.', language: 'ru' },
  { text: 'שלום עולם, זוהי משפט לדוגמה בעברית.', language: 'he' },
  { text: 'Merhaba dünya, bu Türkçe örnek bir cümledir.', language: 'tr' },
  { text: '😊🎉🌍 Emoji test with mixed 中文 and English text!', language: 'en' },
  { text: 'Line\twith\ttabs\tand soft\u00ADhyphen', language: 'en' },
]

function makeSamples(
  language: string | null
): Array<Parameters<typeof validateSamples>[0][number]> {
  const texts = language
    ? SAMPLE_TEXTS.filter((s) => s.language === language)
    : SAMPLE_TEXTS

  return texts.map((s) => ({
    text: s.text,
    language: s.language,
    font: 'system-ui',
    fontSize: 16,
    containerWidth: 300,
    canvasLineCount: 1 + Math.floor(s.text.length / 30),
    domLineCount: 1 + Math.floor(s.text.length / 30),
    durationMs: Math.random() * 1.5 + 0.1,
  }))
}

// ---------------------------------------------------------------------------
// Report output helper
// ---------------------------------------------------------------------------

function outputReport(
  results: MeasurementResult[],
  format: ReportFormat,
  outputPath: string | null
): void {
  const summary = buildSummary(results, 0)
  let content: string

  switch (format) {
    case 'csv':      content = exportToCsv(results, summary); break
    case 'markdown': content = exportToMarkdown(results, summary); break
    case 'html':     content = exportToHtml(results, summary); break
    default:         content = JSON.stringify({ results, summary }, null, 2); break
  }

  if (outputPath) {
    writeFileSync(outputPath, content, 'utf-8')
    console.log(`Report written to ${outputPath}`)
  } else {
    process.stdout.write(content + '\n')
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdValidate(args: Args): Promise<number> {
  const samples = makeSamples(args.language)
  const results = await validateSamples(samples)

  let filtered = results
  if (args.severity) filtered = filtered.filter((r) => r.severity === args.severity)

  if (args.stream) {
    // Stream mode: print each result as it arrives
    for (const r of filtered) {
      const badge = r.severity === 'critical' ? '❌' : r.severity === 'warning' ? '⚠️' : '✅'
      console.log(`${badge} [${r.language}] ${r.severity} — ${r.reason} (${r.divergencePixels.toFixed(2)}px)`)
    }
  }

  outputReport(filtered, args.report, args.output)

  const summary = buildSummary(filtered, 0)
  const statusLine =
    `\nTotal: ${summary.total} | ` +
    `Pass: ${summary.passed} | ` +
    `Warn: ${summary.warnings} | ` +
    `Critical: ${summary.criticals} | ` +
    `Rate: ${(summary.passRate * 100).toFixed(1)}%`
  console.error(statusLine)

  return summary.criticals > 0 ? 2 : summary.warnings > 0 ? 1 : 0
}

async function cmdReport(args: Args): Promise<number> {
  if (!args.input) {
    console.error('--input=<file.json> is required for the report command')
    return 1
  }
  const raw = readFileSync(resolve(args.input), 'utf-8')
  const parsed = JSON.parse(raw) as
    | MeasurementResult[]
    | { results: MeasurementResult[] }
  const results = Array.isArray(parsed) ? parsed : parsed.results
  outputReport(results, args.report, args.output)
  return 0
}

async function cmdWatch(args: Args): Promise<number> {
  const targetFile = args.input ?? args.output ?? null
  if (!targetFile) {
    console.error(
      'Watch mode requires --input=<file> or --output=<file> to monitor'
    )
    return 1
  }

  console.log(`👀 Watching ${targetFile} for changes…`)

  async function runOnce() {
    console.log(`\n[${new Date().toLocaleTimeString()}] Re-validating…`)
    const exitCode = await cmdValidate({ ...args, stream: true })
    const icon = exitCode === 0 ? '✅' : exitCode === 1 ? '⚠️' : '❌'
    console.log(`${icon} Done (exit ${exitCode})`)
  }

  await runOnce()

  // Watch the resolved file for changes.
  const resolvedPath = resolve(targetFile)
  watchFile(resolvedPath, { interval: 500 }, () => {
    runOnce().catch(console.error)
  })

  // Keep process alive.
  await new Promise<void>(() => {})
  return 0
}

async function cmdStream(args: Args): Promise<number> {
  console.log('Streaming validation results (Ctrl+C to stop)…\n')
  let iteration = 0

  async function tick() {
    iteration++
    const samples = makeSamples(args.language)
    const results = await validateSamples(samples)
    for (const r of results) {
      const badge = r.severity === 'critical' ? '❌' : r.severity === 'warning' ? '⚠️' : '✅'
      const ts = new Date().toISOString().slice(11, 23)
      console.log(`[${ts}] #${iteration} ${badge} ${r.language} — ${r.reason} (${r.divergencePixels.toFixed(2)}px)`)
    }
    console.log()
  }

  while (true) {
    await tick()
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

async function cmdTrends(args: Args): Promise<number> {
  const db = new MeasurementDatabase({ path: args.dbPath })
  const results = db.queryAll()
  db.close()

  if (results.length === 0) {
    console.log('No data in database yet. Run `validate` first.')
    return 0
  }

  const metrics = computeMetrics(results)
  let baselineEntries: BaselineEntry[] = []

  if (existsSync(args.baselinePath)) {
    const raw = readFileSync(args.baselinePath, 'utf-8')
    const parsed = JSON.parse(raw) as { entries?: BaselineEntry[] }
    baselineEntries = parsed.entries ?? []
  }

  console.log('\n📈 Performance Trends\n')
  console.log(
    '  Language'.padEnd(12) +
    'Samples'.padEnd(10) +
    'Avg ms'.padEnd(10) +
    'p95 ms'.padEnd(10) +
    'p99 ms'.padEnd(10) +
    'vs Baseline'
  )
  console.log('  ' + '─'.repeat(62))

  const comparisons = compareToBaseline(metrics, baselineEntries)
  const compMap = new Map(comparisons.map((c) => [`${c.language}:${c.metric}`, c]))

  for (const m of metrics) {
    const avgComp = compMap.get(`${m.language}:avgMs`)
    let changeStr = '(no baseline)'
    if (avgComp) {
      const sign = avgComp.changePercent > 0 ? '+' : ''
      const color = avgComp.changePercent > 20 ? '🔴' : avgComp.changePercent > 10 ? '🟡' : '🟢'
      changeStr = `${color} ${sign}${avgComp.changePercent.toFixed(1)}%`
    }
    console.log(
      `  ${m.language.padEnd(10)}` +
      `${m.sampleCount.toString().padEnd(10)}` +
      `${m.avgMs.toFixed(2).padEnd(10)}` +
      `${m.p95Ms.toFixed(2).padEnd(10)}` +
      `${m.p99Ms.toFixed(2).padEnd(10)}` +
      changeStr
    )
  }

  const regressions = detectRegressions(comparisons)
  if (regressions.length > 0) {
    console.log('\n⚡ ' + summarizeRegressions(regressions))
    for (const r of regressions) console.log(`  ${r.message}`)
  }
  console.log()
  return 0
}

async function cmdDashboard(args: Args): Promise<number> {
  const server = new DashboardServer({
    port: args.port,
    dbPath: args.dbPath,
  })
  server.start()
  console.log(`Dashboard running at http://127.0.0.1:${args.port}`)
  console.log('Press Ctrl+C to stop.')
  // Keep alive
  await new Promise<void>(() => {})
  return 0
}

async function cmdBenchmark(args: Args): Promise<number> {
  const argv3 = process.argv[3] ?? ''
  const updateBaseline = argv3 === '--update-baseline' || process.argv.slice(3).includes('--update-baseline')

  console.log('Running benchmark…')
  const samples = makeSamples(null)
  const results = await validateSamples(samples)
  const metrics = computeMetrics(results)

  console.log('\nBenchmark Results:')
  for (const m of metrics) {
    console.log(
      `  ${m.language.padEnd(8)} avg=${m.avgMs.toFixed(2)}ms p95=${m.p95Ms.toFixed(2)}ms p99=${m.p99Ms.toFixed(2)}ms`
    )
  }

  if (updateBaseline) {
    const version: string =
      (JSON.parse(readFileSync('package.json', 'utf-8')) as { version: string }).version
    const entries = metricsToBaseline(metrics, results, version)
    const existing = existsSync(args.baselinePath)
      ? (JSON.parse(readFileSync(args.baselinePath, 'utf-8')) as { entries?: BaselineEntry[] })
      : { entries: [] as BaselineEntry[] }

    // Merge: overwrite same-language entries.
    const merged = [...(existing.entries ?? [])]
    for (const e of entries) {
      const idx = merged.findIndex((x) => x.language === e.language)
      if (idx >= 0) merged[idx] = e
      else merged.push(e)
    }

    const output = {
      version,
      recordedAt: Date.now(),
      note: 'Updated via: bun run scripts/validator-cli.ts benchmark --update-baseline',
      entries: merged,
    }
    writeFileSync(args.baselinePath, JSON.stringify(output, null, 2) + '\n', 'utf-8')
    console.log(`\nBaseline updated → ${args.baselinePath}`)
  }
  return 0
}

function printHelp(): void {
  console.log(`
Measurement Validator CLI

USAGE
  bun run scripts/validator-cli.ts <command> [options]

COMMANDS
  validate       Run validation on sample texts (default)
  report         Convert an existing JSON results file to another format
  watch          Re-validate whenever a file changes
  stream         Continuously stream real-time validation results
  trends         Show historical performance trends from the database
  dashboard      Start the HTTP dashboard server
  benchmark      Run benchmarks (add --update-baseline to persist)

COMMON OPTIONS
  --language=<lang>        Filter to one language (en, ar, zh, ja, ko, th, hi, …)
  --severity=<sev>         Filter: pass | warning | critical
  --report=<fmt>           Output format: json (default) | csv | markdown | html
  --output=<path>          Write report to file instead of stdout
  --input=<path>           Input JSON file (used by report / watch commands)
  --db=<path>              SQLite database path (default: measurements.db)
  --baseline=<path>        Baseline JSON path (default: performance-baseline.json)
  --port=<n>               Dashboard server port (default: 3000)
  --stream                 Print each result live while validating
  --limit=<n>              Max results to process (default: 1000)
  --help, -h               Show this help

EXAMPLES
  bun run scripts/validator-cli.ts validate --language=ar --report=markdown
  bun run scripts/validator-cli.ts validate --report=html --output=report.html
  bun run scripts/validator-cli.ts validate --severity=critical --stream
  bun run scripts/validator-cli.ts report --input=results.json --report=csv
  bun run scripts/validator-cli.ts watch --input=data.json --report=html
  bun run scripts/validator-cli.ts trends
  bun run scripts/validator-cli.ts dashboard --port=8080
  bun run scripts/validator-cli.ts benchmark --update-baseline

EXIT CODES
  0  All pass
  1  Warnings present
  2  Critical divergences detected
`)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv)

if (args.help) {
  printHelp()
  process.exit(0)
}

const COMMANDS: Record<string, (a: Args) => Promise<number>> = {
  validate:  cmdValidate,
  report:    cmdReport,
  watch:     cmdWatch,
  stream:    cmdStream,
  trends:    cmdTrends,
  dashboard: cmdDashboard,
  benchmark: cmdBenchmark,
}

const handler = COMMANDS[args.command]
if (!handler) {
  console.error(`Unknown command: ${args.command}`)
  printHelp()
  process.exit(1)
}

handler(args)
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
