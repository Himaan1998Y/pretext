import { describe, test, expect } from 'bun:test'
import { SlackNotifier, createSlackNotifierFromEnv } from './slack-notifier.js'
import type { PerformanceRegression, ValidationSummary } from './types.js'

// We test the message-building logic by monkey-patching the private post method.
function makeTestNotifier(captured: unknown[] = []): SlackNotifier {
  const n = new SlackNotifier({ webhookUrl: 'https://hooks.slack.com/test' })
  // Override fetch to capture messages instead of actually posting
  ;(n as unknown as Record<string, unknown>)['post'] = async (msg: unknown) => {
    captured.push(msg)
  }
  return n
}

const okSummary: ValidationSummary = {
  total: 100,
  passed: 100,
  warnings: 0,
  critical: 0,
  passRate: 1.0,
  avgDeltaPercent: 0.1,
  maxDeltaPercent: 0.5,
}

const warnSummary: ValidationSummary = {
  total: 100,
  passed: 90,
  warnings: 8,
  critical: 2,
  passRate: 0.9,
  avgDeltaPercent: 1.5,
  maxDeltaPercent: 5.0,
}

const criticalRegression: PerformanceRegression = {
  language: 'arabic',
  metric: 'avgTotalMs',
  baselineMs: 1.0,
  currentMs: 2.5,
  changePercent: 150,
  severity: 'critical',
}

const warningRegression: PerformanceRegression = {
  language: 'chinese',
  metric: 'avgTotalMs',
  baselineMs: 1.0,
  currentMs: 1.3,
  changePercent: 30,
  severity: 'warning',
}

describe('SlackNotifier.sendValidationSummary', () => {
  test('sends message for ok summary', async () => {
    const captured: unknown[] = []
    const n = makeTestNotifier(captured)
    await n.sendValidationSummary(okSummary, [], { runId: 'run-1' })
    expect(captured).toHaveLength(1)
    const msg = captured[0] as Record<string, unknown>
    expect(msg['text']).toContain('PASSED')
  })

  test('sends message for critical summary', async () => {
    const captured: unknown[] = []
    const n = makeTestNotifier(captured)
    await n.sendValidationSummary(warnSummary, [criticalRegression], { runId: 'run-2' })
    expect(captured).toHaveLength(1)
    const msg = captured[0] as Record<string, unknown>
    expect((msg['text'] as string)).toContain('CRITICAL')
  })

  test('respects minSeverity=critical — skips ok summary', async () => {
    const captured: unknown[] = []
    const n = new SlackNotifier({
      webhookUrl: 'https://hooks.slack.com/test',
      minSeverity: 'critical',
    })
    ;(n as unknown as Record<string, unknown>)['post'] = async (msg: unknown) => captured.push(msg)
    await n.sendValidationSummary(okSummary, [], { runId: 'run-3' })
    expect(captured).toHaveLength(0)
  })

  test('includes PR URL in message when provided', async () => {
    const captured: unknown[] = []
    const n = makeTestNotifier(captured)
    await n.sendValidationSummary(okSummary, [], {
      runId: 'run-4',
      prUrl: 'https://github.com/org/repo/pull/42',
    })
    const attachment = (captured[0] as Record<string, unknown[]>)['attachments']![0] as Record<string, unknown>
    expect(attachment['text']).toContain('https://github.com/org/repo/pull/42')
  })

  test('includes branch and commit in fields when provided', async () => {
    const captured: unknown[] = []
    const n = makeTestNotifier(captured)
    await n.sendValidationSummary(okSummary, [], {
      runId: 'run-5',
      branch: 'feature/foo',
      commitSha: 'deadbeef1234',
    })
    const attachment = (captured[0] as Record<string, unknown[]>)['attachments']![0] as Record<string, unknown>
    const fields = attachment['fields'] as Array<{ title: string; value: string }>
    expect(fields.some((f) => f.value === 'feature/foo')).toBe(true)
    expect(fields.some((f) => f.value === 'deadbeef')).toBe(true)
  })
})

describe('SlackNotifier.sendRegressionAlert', () => {
  test('sends nothing when no regressions', async () => {
    const captured: unknown[] = []
    const n = makeTestNotifier(captured)
    await n.sendRegressionAlert([], { runId: 'run-6' })
    expect(captured).toHaveLength(0)
  })

  test('sends blocks message with regression details', async () => {
    const captured: unknown[] = []
    const n = makeTestNotifier(captured)
    await n.sendRegressionAlert([criticalRegression, warningRegression], { runId: 'run-7' })
    expect(captured).toHaveLength(1)
    const msg = captured[0] as Record<string, unknown>
    const blocks = msg['blocks'] as Array<Record<string, unknown>>
    const allText = JSON.stringify(blocks)
    expect(allText).toContain('arabic')
    expect(allText).toContain('chinese')
    expect(allText).toContain('run-7')
  })
})

describe('SlackNotifier.sendDailySummary', () => {
  test('sends summary with pass rate', async () => {
    const captured: unknown[] = []
    const n = makeTestNotifier(captured)
    await n.sendDailySummary({
      totalRuns: 5,
      avgPassRate: 0.97,
      criticalCount: 0,
      topLanguages: ['english', 'arabic'],
    })
    expect(captured).toHaveLength(1)
    const msg = captured[0] as Record<string, unknown>
    const blocksText = JSON.stringify(msg['blocks'])
    expect(blocksText).toContain('97.0%')
    expect(blocksText).toContain('english')
  })
})

describe('createSlackNotifierFromEnv', () => {
  test('returns null when SLACK_WEBHOOK_URL is not set', () => {
    const original = process.env['SLACK_WEBHOOK_URL']
    delete process.env['SLACK_WEBHOOK_URL']
    const n = createSlackNotifierFromEnv()
    expect(n).toBeNull()
    if (original) process.env['SLACK_WEBHOOK_URL'] = original
  })

  test('returns notifier when SLACK_WEBHOOK_URL is set', () => {
    process.env['SLACK_WEBHOOK_URL'] = 'https://hooks.slack.com/services/test'
    const n = createSlackNotifierFromEnv()
    expect(n).not.toBeNull()
    delete process.env['SLACK_WEBHOOK_URL']
  })
})
