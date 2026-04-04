#!/usr/bin/env bun
/**
 * Measurement Validator CLI
 *
 * Usage:
 *   bun run scripts/cli.ts validate [options]
 *   bun run scripts/cli.ts report   [options]
 *   bun run scripts/cli.ts help
 */

import { runValidation } from './validate-command.ts'
import { generateReport } from './report-command.ts'

const USAGE = `
Measurement Validator CLI

USAGE
  bun run scripts/cli.ts <command> [options]

COMMANDS
  validate    Validate measurements against a corpus
  report      Generate a report from saved results
  help        Show this help text

Run "bun run scripts/cli.ts <command> --help" for command-specific options.
`.trim()

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0]

  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE)
    process.exit(0)
  }

  if (command === 'validate') {
    await runValidation(args.slice(1))
    return
  }

  if (command === 'report') {
    await generateReport(args.slice(1))
    return
  }

  console.error(`Unknown command: ${command}`)
  console.error('Run "bun run scripts/cli.ts help" for usage.')
  process.exit(3)
}

await main()
