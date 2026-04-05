#!/usr/bin/env node
// CLI entry point for the measurement-validator tool.
//
// Commands:
//   validate [options]             Run validation on built-in or custom fixtures
//   report --input=<file> [opts]   Transform an existing JSON results file
//   help                           Show usage
//
// Flags (all commands):
//   --corpus=<name>      Corpus to validate: english|rtl|cjk|complex|mixed|all (default: all)
//   --report=<format>    Output format: console|html|csv|markdown|json (default: console)
//   --output=<path>      Write report to file instead of stdout
//   --language=<lang>    Filter results by language category
//   --severity=<level>   Filter by minimum severity: exact|close|warning|error|critical
//   --verbose            Show individual result details in console mode
//   --no-color           Disable ANSI colour codes

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ReportFormatter } from '../src/measurement-validator/report-formatter.ts'
import { compareWidths } from '../src/measurement-validator/comparator.ts'
import type {
  LanguageCategory,
  MeasurementPair,
  Severity,
  ValidationResult,
} from '../src/measurement-validator/types.ts'

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

type ParsedArgs = {
  command: string
  corpus: string
  report: string
  output: string | null
  input: string | null
  language: LanguageCategory | null
  severity: Severity | null
  verbose: boolean
  color: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2) // skip 'node' and script path
  const command = (args.find((a) => !a.startsWith('-')) ?? 'help').toLowerCase()

  function flag(name: string, defaultVal: string): string {
    const match = args.find((a) => a.startsWith(`--${name}=`))
    return match !== undefined ? (match.split('=').slice(1).join('=')) : defaultVal
  }

  function boolFlag(name: string, defaultVal: boolean): boolean {
    if (args.includes(`--${name}`)) return true
    if (args.includes(`--no-${name}`)) return false
    return defaultVal
  }

  const languageRaw = flag('language', '')
  const severityRaw = flag('severity', '')

  const validLanguages: LanguageCategory[] = [
    'english', 'arabic', 'hebrew', 'urdu',
    'chinese', 'japanese', 'korean',
    'thai', 'myanmar', 'khmer',
    'mixed', 'unknown',
  ]
  const validSeverities: Severity[] = ['exact', 'close', 'warning', 'error', 'critical']

  const language: LanguageCategory | null =
    languageRaw !== '' && (validLanguages as string[]).includes(languageRaw)
      ? (languageRaw as LanguageCategory)
      : null

  const severity: Severity | null =
    severityRaw !== '' && (validSeverities as string[]).includes(severityRaw)
      ? (severityRaw as Severity)
      : null

  return {
    command,
    corpus: flag('corpus', 'all'),
    report: flag('report', 'console'),
    output: flag('output', '') || null,
    input: flag('input', '') || null,
    language,
    severity,
    verbose: boolFlag('verbose', false),
    color: boolFlag('color', true),
  }
}

// ---------------------------------------------------------------------------
// Built-in sample fixtures (inline so the CLI has no file-system dependency
// for the sample data itself)
// ---------------------------------------------------------------------------

type SampleDef = {
  id: string
  text: string
  font: string
  fontSize: number
  containerWidth: number
  pretextWidth: number
  domWidth: number
  language?: LanguageCategory
}

const SAMPLES: SampleDef[] = [
  // English
  { id: 'en-01', text: 'Hello world', font: 'Arial', fontSize: 16, containerWidth: 400, pretextWidth: 87.5, domWidth: 88.0, language: 'english' },
  { id: 'en-02', text: 'The quick brown fox jumps over the lazy dog', font: 'Arial', fontSize: 16, containerWidth: 400, pretextWidth: 320.0, domWidth: 320.5, language: 'english' },
  { id: 'en-03', text: 'Typography matters', font: 'Helvetica', fontSize: 14, containerWidth: 300, pretextWidth: 142.0, domWidth: 143.0, language: 'english' },
  { id: 'en-04', text: 'Pretext canvas measurement', font: 'Arial', fontSize: 18, containerWidth: 500, pretextWidth: 248.0, domWidth: 264.0, language: 'english' },
  // Arabic / RTL
  { id: 'ar-01', text: 'مرحبا بالعالم', font: 'Arial', fontSize: 16, containerWidth: 400, pretextWidth: 95.2, domWidth: 110.5, language: 'arabic' },
  { id: 'ar-02', text: 'النص العربي', font: 'Arial', fontSize: 16, containerWidth: 400, pretextWidth: 88.0, domWidth: 102.0, language: 'arabic' },
  { id: 'he-01', text: 'שלום עולם', font: 'Arial', fontSize: 16, containerWidth: 400, pretextWidth: 78.0, domWidth: 80.0, language: 'hebrew' },
  // CJK
  { id: 'zh-01', text: '你好世界', font: 'Arial', fontSize: 16, containerWidth: 400, pretextWidth: 64.0, domWidth: 70.0, language: 'chinese' },
  { id: 'ja-01', text: 'こんにちは', font: 'Arial', fontSize: 16, containerWidth: 400, pretextWidth: 80.0, domWidth: 80.5, language: 'japanese' },
  { id: 'ko-01', text: '안녕하세요', font: 'Arial', fontSize: 16, containerWidth: 400, pretextWidth: 72.0, domWidth: 72.0, language: 'korean' },
  // Complex scripts
  { id: 'th-01', text: 'สวัสดีชาวโลก', font: 'Arial', fontSize: 16, containerWidth: 400, pretextWidth: 115.0, domWidth: 116.0, language: 'thai' },
  // Mixed
  { id: 'mix-01', text: 'Hello مرحبا', font: 'Arial', fontSize: 16, containerWidth: 400, pretextWidth: 108.0, domWidth: 122.0, language: 'mixed' },
]

const CORPUS_FILTER: Record<string, (s: SampleDef) => boolean> = {
  all: () => true,
  english: (s) => s.language === 'english',
  rtl: (s) => s.language === 'arabic' || s.language === 'hebrew' || s.language === 'urdu',
  cjk: (s) => s.language === 'chinese' || s.language === 'japanese' || s.language === 'korean',
  complex: (s) => s.language === 'thai' || s.language === 'myanmar' || s.language === 'khmer',
  mixed: (s) => s.language === 'mixed',
}

function runValidation(corpus: string): ValidationResult[] {
  const filter = CORPUS_FILTER[corpus] ?? CORPUS_FILTER['all']
  if (filter === undefined) {
    throw new Error(`Unknown corpus: ${corpus}`)
  }
  const samples = SAMPLES.filter(filter)
  const timestamp = new Date().toISOString()

  return samples.map((s) => {
    const sampleBase = {
      id: s.id,
      text: s.text,
      font: s.font,
      fontSize: s.fontSize,
      containerWidth: s.containerWidth,
    }
    const pair: MeasurementPair = {
      sample: s.language !== undefined ? { ...sampleBase, language: s.language } : sampleBase,
      pretextWidth: s.pretextWidth,
      domWidth: s.domWidth,
    }
    return compareWidths(pair, timestamp)
  })
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateReport(
  formatter: ReportFormatter,
  format: string,
  useColor: boolean,
): string {
  switch (format) {
    case 'html':
      return formatter.toHTML()
    case 'csv':
      return formatter.toCSV()
    case 'markdown':
    case 'md':
      return formatter.toMarkdown()
    case 'json':
      return formatter.toJSON()
    case 'console':
      return formatter.toConsole(useColor)
    default:
      throw new Error(`Unknown report format: ${format}. Use console|html|csv|markdown|json`)
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdHelp(): void {
  console.log(`
Usage: bun run scripts/cli.ts <command> [options]

Commands:
  validate    Run validation on built-in fixture data
  report      Transform an existing JSON results file
  help        Show this help message

Options:
  --corpus=<name>      Corpus to validate: english|rtl|cjk|complex|mixed|all
                       (default: all)
  --report=<format>    Output format: console|html|csv|markdown|json
                       (default: console)
  --output=<path>      Write report to a file instead of stdout
  --input=<path>       Input JSON file (required for 'report' command)
  --language=<lang>    Filter results by language category
  --severity=<level>   Filter by minimum severity: exact|close|warning|error|critical
  --verbose            Show individual result details in console mode
  --no-color           Disable ANSI colour codes

Exit codes:
  0  All samples pass (exact or close)
  1  One or more warnings (no errors/critical)
  2  One or more errors or critical failures

Examples:
  bun run scripts/cli.ts validate
  bun run scripts/cli.ts validate --corpus=rtl --report=html --output=report.html
  bun run scripts/cli.ts validate --severity=warning --no-color
  bun run scripts/cli.ts report --input=results.json --report=csv --output=out.csv
`)
}

function cmdValidate(args: ParsedArgs): number {
  const results = runValidation(args.corpus)
  return applyAndReport(results, args)
}

function cmdReport(args: ParsedArgs): number {
  if (args.input === null) {
    console.error('Error: --input=<file> is required for the report command.')
    return 2
  }

  const absPath = resolve(args.input)
  if (!existsSync(absPath)) {
    console.error(`Error: input file not found: ${absPath}`)
    return 2
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(absPath, 'utf-8'))
  } catch {
    console.error(`Error: could not parse JSON from ${absPath}`)
    return 2
  }

  // Accept either a bare array or a ValidationReport document
  let results: ValidationResult[]
  if (Array.isArray(parsed)) {
    results = parsed as ValidationResult[]
  } else if (
    parsed !== null &&
    typeof parsed === 'object' &&
    'results' in parsed &&
    Array.isArray((parsed as Record<string, unknown>)['results'])
  ) {
    results = (parsed as { results: ValidationResult[] }).results
  } else {
    console.error('Error: input JSON must be an array of results or a ValidationReport document.')
    return 2
  }

  return applyAndReport(results, args)
}

function applyAndReport(results: ValidationResult[], args: ParsedArgs): number {
  let fmt = new ReportFormatter(results)

  if (args.language !== null) fmt = fmt.filterByLanguage(args.language)
  if (args.severity !== null) fmt = fmt.filterBySeverity(args.severity)

  const output = generateReport(fmt, args.report, args.color)

  if (args.output !== null) {
    writeFileSync(resolve(args.output), output, 'utf-8')
    console.log(`Report written to: ${args.output}`)
  } else {
    process.stdout.write(output + (output.endsWith('\n') ? '' : '\n'))
  }

  if (args.verbose && args.report === 'console') {
    const data = fmt.data
    for (const r of data) {
      const indicator =
        r.severity === 'exact' || r.severity === 'close'
          ? '✅'
          : r.severity === 'warning'
            ? '⚠️ '
            : '❌'
      console.log(
        `  ${indicator} [${r.id}] ${r.text.slice(0, 40).padEnd(42)} ` +
          `Δ=${r.delta.toFixed(2)}px (${r.severity})`,
      )
    }
  }

  // Determine exit code from summary
  const s = fmt.summary()
  if (s.critical > 0 || s.error > 0) return 2
  if (s.warning > 0) return 1
  return 0
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv)

  let exitCode: number
  switch (args.command) {
    case 'validate':
      exitCode = cmdValidate(args)
      break
    case 'report':
      exitCode = cmdReport(args)
      break
    case 'help':
    default:
      cmdHelp()
      exitCode = 0
      break
  }

  process.exit(exitCode)
}

main()
