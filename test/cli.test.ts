import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runValidation } from '../scripts/validate-command.ts'
import { generateReport } from '../scripts/report-command.ts'

// ── helpers ───────────────────────────────────────────────────────────────────

type ExitFn = (code?: number) => never

/** Swap process.exit with a non-throwing stub that records the exit code. */
function stubExit(): { restore: () => void; lastCode: () => number } {
  let code = 0
  const original = process.exit as ExitFn
  ;(process as { exit: ExitFn }).exit = ((c?: number) => {
    code = c ?? 0
  }) as unknown as ExitFn
  return {
    restore: () => {
      ;(process as { exit: ExitFn }).exit = original
    },
    lastCode: () => code,
  }
}

/** Capture all writes to process.stdout during `fn()`. */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = []
  const original = process.stdout.write.bind(
    process.stdout,
  ) as typeof process.stdout.write
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    chunks.push(
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
    )
    return true
  }) as typeof process.stdout.write
  try {
    await fn()
  } finally {
    process.stdout.write = original
  }
  return chunks.join('')
}

// ── validate command ──────────────────────────────────────────────────────────

describe('validate command', () => {
  test('outputs a console summary by default', async () => {
    const exit = stubExit()
    let output = ''
    try {
      output = await captureStdout(() => runValidation([]))
    } finally {
      exit.restore()
    }
    expect(output).toContain('Total:')
  })

  test('outputs CSV when --report=csv', async () => {
    const exit = stubExit()
    let output = ''
    try {
      output = await captureStdout(() => runValidation(['--report=csv']))
    } finally {
      exit.restore()
    }
    expect(output).toMatch(/Sample|sampleId/i)
  })

  test('outputs Markdown when --report=markdown', async () => {
    const exit = stubExit()
    let output = ''
    try {
      output = await captureStdout(() =>
        runValidation(['--report=markdown']),
      )
    } finally {
      exit.restore()
    }
    expect(output).toContain('# Measurement Validator Report')
  })

  test('outputs HTML when --report=html', async () => {
    const exit = stubExit()
    let output = ''
    try {
      output = await captureStdout(() => runValidation(['--report=html']))
    } finally {
      exit.restore()
    }
    expect(output).toMatch(/<!DOCTYPE html>/i)
  })

  test('outputs JSON when --report=json', async () => {
    const exit = stubExit()
    let output = ''
    try {
      output = await captureStdout(() => runValidation(['--report=json']))
    } finally {
      exit.restore()
    }
    const parsed = JSON.parse(output) as unknown[]
    expect(Array.isArray(parsed)).toBe(true)
  })

  test('filters by language', async () => {
    const exit = stubExit()
    let output = ''
    try {
      output = await captureStdout(() =>
        runValidation(['--language=en', '--report=json']),
      )
    } finally {
      exit.restore()
    }
    const parsed = JSON.parse(output) as Array<{ language: string }>
    expect(parsed.every(r => r.language === 'en')).toBe(true)
  })

  test('filters by severity (critical only)', async () => {
    const exit = stubExit()
    let output = ''
    try {
      output = await captureStdout(() =>
        runValidation(['--corpus=all', '--severity=critical', '--report=json']),
      )
    } finally {
      exit.restore()
    }
    const parsed = JSON.parse(output) as Array<{ overallSeverity: string }>
    expect(parsed.every(r => r.overallSeverity === 'critical')).toBe(true)
  })

  test('writes output file when --output is specified', async () => {
    const file = join(tmpdir(), `pretext-cli-test-${Date.now()}.csv`)
    const exit = stubExit()
    try {
      await runValidation(['--report=csv', `--output=${file}`])
      expect(existsSync(file)).toBe(true)
      const content = readFileSync(file, 'utf-8')
      expect(content).toContain('Sample')
    } finally {
      exit.restore()
      if (existsSync(file)) rmSync(file)
    }
  })

  test('exits with code 0 when all pass', async () => {
    const exit = stubExit()
    try {
      await captureStdout(() =>
        runValidation([
          '--corpus=english',
          '--severity=pass',
          '--report=json',
        ]),
      )
    } finally {
      exit.restore()
    }
    expect(exit.lastCode()).toBe(0)
  })

  test('exits with code 2 when critical issues detected', async () => {
    const exit = stubExit()
    try {
      await captureStdout(() => runValidation(['--corpus=all']))
    } finally {
      exit.restore()
    }
    expect(exit.lastCode()).toBe(2)
  })
})

// ── report command ────────────────────────────────────────────────────────────

describe('report command', () => {
  let tmpFile: string
  let tmpOutput: string

  beforeEach(() => {
    tmpFile = join(tmpdir(), `pretext-results-${Date.now()}.json`)
    tmpOutput = join(tmpdir(), `pretext-report-${Date.now()}.md`)
  })

  afterEach(() => {
    if (existsSync(tmpFile)) rmSync(tmpFile)
    if (existsSync(tmpOutput)) rmSync(tmpOutput)
  })

  test('errors with exit code 3 when --input is missing', async () => {
    const exit = stubExit()
    try {
      await generateReport([])
    } finally {
      exit.restore()
    }
    expect(exit.lastCode()).toBe(3)
  })

  test('errors with exit code 4 when input file does not exist', async () => {
    const exit = stubExit()
    try {
      await generateReport(['--input=/nonexistent/path/results.json'])
    } finally {
      exit.restore()
    }
    expect(exit.lastCode()).toBe(4)
  })

  test('generates markdown report from JSON file', async () => {
    const results = [
      {
        sampleId: 'test',
        text: 'Hello',
        font: '16px Arial',
        maxWidth: 400,
        pretextWidth: 50,
        domWidth: 50,
        delta: 0,
        errorPercent: 0,
        overallSeverity: 'pass',
        rootCause: '-',
        confidence: 1,
        timestamp: new Date().toISOString(),
        language: 'en',
      },
    ]
    writeFileSync(tmpFile, JSON.stringify(results))

    const exit = stubExit()
    let output = ''
    try {
      output = await captureStdout(() =>
        generateReport([`--input=${tmpFile}`, '--format=markdown']),
      )
    } finally {
      exit.restore()
    }
    expect(output).toContain('# Measurement Validator Report')
  })

  test('writes output file', async () => {
    const results = [
      {
        sampleId: 'test',
        text: 'Hello',
        font: '16px Arial',
        maxWidth: 400,
        pretextWidth: 50,
        domWidth: 50,
        delta: 0,
        errorPercent: 0,
        overallSeverity: 'pass',
        rootCause: '-',
        confidence: 1,
        timestamp: new Date().toISOString(),
        language: 'en',
      },
    ]
    writeFileSync(tmpFile, JSON.stringify(results))

    const exit = stubExit()
    try {
      await generateReport([
        `--input=${tmpFile}`,
        '--format=markdown',
        `--output=${tmpOutput}`,
      ])
    } finally {
      exit.restore()
    }

    expect(existsSync(tmpOutput)).toBe(true)
    const content = readFileSync(tmpOutput, 'utf-8')
    expect(content).toContain('# Measurement Validator Report')
  })
})
