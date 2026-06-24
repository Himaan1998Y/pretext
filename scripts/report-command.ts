/**
 * `report` command — generates a report from a saved JSON results file.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import {
  ReportFormatter,
  type MeasurementResult,
  type MeasurementSeverity,
} from '../src/measurement-validator/index.ts'

export interface ReportOptions {
  input: string | null
  format: string
  output: string | null
  language: string | null
  severity: MeasurementSeverity | null
}

function parseArgs(args: string[]): ReportOptions {
  const opts: ReportOptions = {
    input: null,
    format: 'console',
    output: null,
    language: null,
    severity: null,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else if (arg.startsWith('--input=')) {
      opts.input = arg.slice('--input='.length)
    } else if (arg === '--input') {
      opts.input = args[++i] ?? null
    } else if (arg.startsWith('--format=')) {
      opts.format = arg.slice('--format='.length)
    } else if (arg === '--format') {
      opts.format = args[++i] ?? opts.format
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
    }
  }

  return opts
}

function printHelp(): void {
  console.log(`
report — Generate a report from existing results

USAGE
  bun run scripts/cli.ts report --input=results.json [options]

OPTIONS
  --input [path]     (required) Path to JSON results file.
  --format [csv|markdown|html|json|console]
                     Output format. Default: console
  --output [path]    File to write report. Default: stdout
  --language [code]  Filter by BCP-47 language tag.
  --severity [pass|warning|error|critical]
                     Filter by severity.
`.trim())
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

export async function generateReport(args: string[]): Promise<void> {
  const opts = parseArgs(args)

  if (opts.input === null) {
    console.error('Error: --input is required for the report command.')
    console.error('Run "bun run scripts/cli.ts report --help" for usage.')
    process.exit(3)
    return
  }

  let raw: string
  try {
    raw = readFileSync(opts.input, 'utf-8')
  } catch (err) {
    console.error(`Error: could not read input file "${opts.input}": ${String(err)}`)
    process.exit(4)
    return
  }

  let results: MeasurementResult[]
  try {
    results = JSON.parse(raw) as MeasurementResult[]
  } catch (err) {
    console.error(`Error: invalid JSON in "${opts.input}": ${String(err)}`)
    process.exit(4)
    return
  }

  let formatter = new ReportFormatter(results)

  if (opts.language !== null) {
    formatter = formatter.filterByLanguage(opts.language)
  }

  if (opts.severity !== null) {
    formatter = formatter.filterBySeverity(opts.severity)
  }

  const output = formatReport(formatter, opts.format)

  if (opts.output !== null) {
    try {
      writeFileSync(opts.output, output, 'utf-8')
      console.log(`Report written to ${opts.output}`)
    } catch (err) {
      console.error(`Error: could not write to "${opts.output}": ${String(err)}`)
      process.exit(4)
    }
  } else {
    process.stdout.write(output + '\n')
  }
}
