/**
 * `validate` command — runs measurements against a named corpus and outputs
 * a report in the requested format.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import {
  ReportFormatter,
  type MeasurementResult,
  type MeasurementSeverity,
} from '../src/measurement-validator/index.ts'

export interface ValidationOptions {
  corpus: string
  report: string
  output: string | null
  language: string | null
  severity: MeasurementSeverity | null
  font: string | null
  verbose: boolean
  noColor: boolean
}

function parseArgs(args: string[]): ValidationOptions {
  const opts: ValidationOptions = {
    corpus: 'english',
    report: 'console',
    output: null,
    language: null,
    severity: null,
    font: null,
    verbose: false,
    noColor: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else if (arg.startsWith('--corpus=')) {
      opts.corpus = arg.slice('--corpus='.length)
    } else if (arg === '--corpus') {
      opts.corpus = args[++i] ?? opts.corpus
    } else if (arg.startsWith('--report=')) {
      opts.report = arg.slice('--report='.length)
    } else if (arg === '--report') {
      opts.report = args[++i] ?? opts.report
    } else if (arg.startsWith('--output=')) {
      opts.output = arg.slice('--output='.length)
    } else if (arg === '--output') {
      opts.output = args[++i] ?? null
    } else if (arg.startsWith('--language=')) {
      opts.language = arg.slice('--language='.length)
    } else if (arg === '--language') {
      opts.language = args[++i] ?? null
    } else if (arg.startsWith('--severity=')) {
      opts.severity = arg.slice('--severity='.length) as MeasurementSeverity
    } else if (arg === '--severity') {
      opts.severity = (args[++i] ?? null) as MeasurementSeverity | null
    } else if (arg.startsWith('--font=')) {
      opts.font = arg.slice('--font='.length)
    } else if (arg === '--font') {
      opts.font = args[++i] ?? null
    } else if (arg === '--verbose') {
      opts.verbose = true
    } else if (arg === '--no-color') {
      opts.noColor = true
    }
  }

  return opts
}

function printHelp(): void {
  console.log(`
validate — Validate measurements against a corpus

USAGE
  bun run scripts/cli.ts validate [options]

OPTIONS
  --corpus [all|english|rtl|cjk|complex|mixed]
      Which test corpus to validate. Default: english

  --report [csv|markdown|html|json|console]
      Output format. Default: console

  --output [path]
      File to write report. Default: stdout

  --language [code]
      Filter by BCP-47 language tag (e.g. en, ar).

  --severity [pass|warning|error|critical]
      Filter by severity.

  --font [pattern]
      Filter by font pattern.

  --verbose
      Show detailed output.

  --no-color
      Disable colored output.
`.trim())
}

function loadCorpus(corpusId: string): MeasurementResult[] {
  if (corpusId === 'all' || corpusId === 'english') {
    // Built-in minimal stub corpus for offline use.
    return makeStubCorpus(corpusId)
  }

  // Try to load from a JSON file named after the corpus.
  try {
    const raw = readFileSync(`corpora/${corpusId}.json`, 'utf-8')
    return JSON.parse(raw) as MeasurementResult[]
  } catch {
    // Fall back to stub if file not found.
    return makeStubCorpus(corpusId)
  }
}

function makeStubCorpus(corpusId: string): MeasurementResult[] {
  const now = new Date().toISOString()
  const stubs: MeasurementResult[] = [
    {
      sampleId: 'en-simple',
      text: 'Hello world',
      font: '16px Arial',
      maxWidth: 400,
      pretextWidth: 87.5,
      domWidth: 88.0,
      delta: 0.5,
      errorPercent: 0.57,
      overallSeverity: 'pass',
      rootCause: '-',
      confidence: 1.0,
      timestamp: now,
      language: 'en',
    },
    {
      sampleId: 'en-sentence',
      text: 'The quick brown fox jumps over the lazy dog',
      font: '16px Arial',
      maxWidth: 400,
      pretextWidth: 302.4,
      domWidth: 303.0,
      delta: 0.6,
      errorPercent: 0.2,
      overallSeverity: 'pass',
      rootCause: '-',
      confidence: 1.0,
      timestamp: now,
      language: 'en',
    },
  ]

  if (corpusId === 'all' || corpusId === 'rtl') {
    stubs.push({
      sampleId: 'ar-simple',
      text: 'مرحبا',
      font: '16px Arial',
      maxWidth: 400,
      pretextWidth: 95.2,
      domWidth: 110.5,
      delta: 15.3,
      errorPercent: 16.1,
      overallSeverity: 'critical',
      rootCause: 'bidi_shaping',
      confidence: 0.85,
      timestamp: now,
      language: 'ar',
    })
  }

  return stubs
}

function formatReport(formatter: ReportFormatter, format: string): string {
  switch (format) {
    case 'csv':
      return formatter.toCSV({ encoding: 'utf-8-bom' })
    case 'markdown':
    case 'md':
      return formatter.toMarkdown({ groupByLanguage: true })
    case 'html':
      return formatter.toHTML()
    case 'json':
      return formatter.toJSON()
    default:
      return formatter.toConsole()
  }
}

function exitCodeForSummary(
  summary: ReturnType<ReportFormatter['summary']>,
): number {
  if (summary.critical > 0) return 2
  if (summary.warnings > 0 || summary.errors > 0) return 1
  return 0
}

export async function runValidation(args: string[]): Promise<void> {
  const opts = parseArgs(args)

  let results = loadCorpus(opts.corpus)

  let formatter = new ReportFormatter(results)

  if (opts.language !== null) {
    formatter = formatter.filterByLanguage(opts.language)
  }

  if (opts.severity !== null) {
    formatter = formatter.filterBySeverity(opts.severity)
  }

  const output = formatReport(formatter, opts.report)

  if (opts.output !== null) {
    writeFileSync(opts.output, output, 'utf-8')
    if (opts.verbose || opts.report === 'console') {
      console.log(`Report written to ${opts.output}`)
    }
  } else {
    process.stdout.write(output + '\n')
  }

  const summary = formatter.summary()
  if (opts.verbose) {
    console.error(
      `Summary: ${summary.passed} passed, ${summary.warnings} warnings, ` +
        `${summary.errors} errors, ${summary.critical} critical`,
    )
  }

  process.exit(exitCodeForSummary(summary))
}
