// Slack notifier: sends formatted validation result notifications via webhooks.
// No authentication required — uses incoming webhook URLs only.

import type { MeasurementResult, RegressionResult, ValidationSummary } from './types.js'
import { summarizeRegressions } from './regression-detector.js'

export type SlackNotifierOptions = {
  webhookUrl: string
  channel?: string
  username?: string
  iconEmoji?: string
}

type SlackBlock =
  | { type: 'header'; text: { type: 'plain_text'; text: string } }
  | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
  | { type: 'divider' }

type SlackPayload = {
  channel?: string | undefined
  username?: string
  icon_emoji?: string
  blocks: SlackBlock[]
  text: string
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function buildValidationPayload(
  summary: ValidationSummary,
  options: SlackNotifierOptions
): SlackPayload {
  const status =
    summary.criticals > 0 ? '❌ Failed' : summary.warnings > 0 ? '⚠️ Warning' : '✅ Passed'

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Measurement Validation: ${status}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*Pass rate:* ${pct(summary.passRate)}  |  ` +
          `*Total:* ${summary.total}  |  ` +
          `*Passed:* ${summary.passed}  |  ` +
          `*Warnings:* ${summary.warnings}  |  ` +
          `*Critical:* ${summary.criticals}`,
      },
    },
  ]

  if (summary.byLanguage.length > 0) {
    const langLines = summary.byLanguage
      .filter((b) => b.criticals > 0 || b.warnings > 0)
      .map((b) => `• *${b.language}*: ${pct(b.passRate)} pass rate`)
    if (langLines.length > 0) {
      blocks.push({ type: 'divider' })
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*Affected languages:*\n' + langLines.join('\n') },
      })
    }
  }

  return {
    channel: options.channel,
    username: options.username ?? 'Measurement Validator',
    icon_emoji: options.iconEmoji ?? ':mag:',
    blocks,
    text: `Validation ${status}: ${pct(summary.passRate)} pass rate`,
  }
}

function buildRegressionPayload(
  regressions: RegressionResult[],
  options: SlackNotifierOptions
): SlackPayload {
  const summary = summarizeRegressions(regressions)
  const lines = regressions.slice(0, 10).map((r) => `• ${r.message}`)
  if (regressions.length > 10) lines.push(`• …and ${regressions.length - 10} more`)

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '⚡ Performance Regression Alert' },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: summary },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: lines.join('\n') },
    },
  ]

  return {
    channel: options.channel,
    username: options.username ?? 'Measurement Validator',
    icon_emoji: options.iconEmoji ?? ':zap:',
    blocks,
    text: summary,
  }
}

async function postToSlack(
  payload: SlackPayload,
  webhookUrl: string
): Promise<void> {
  const body = JSON.stringify(payload)
  let response: { ok: boolean; status: number; text: () => Promise<string> }

  try {
    response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  } catch (err) {
    throw new Error(`Slack webhook request failed: ${String(err)}`)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)')
    throw new Error(`Slack webhook returned ${response.status}: ${text}`)
  }
}

export class SlackNotifier {
  constructor(private readonly options: SlackNotifierOptions) {}

  async notifyValidation(summary: ValidationSummary): Promise<void> {
    const payload = buildValidationPayload(summary, this.options)
    await postToSlack(payload, this.options.webhookUrl)
  }

  async notifyRegressions(regressions: RegressionResult[]): Promise<void> {
    if (regressions.length === 0) return
    const payload = buildRegressionPayload(regressions, this.options)
    await postToSlack(payload, this.options.webhookUrl)
  }

  async notifyCriticalResults(results: MeasurementResult[]): Promise<void> {
    const criticals = results.filter((r) => r.severity === 'critical')
    if (criticals.length === 0) return
    const lines = criticals.slice(0, 10).map(
      (r) =>
        `• *${r.language}* [${r.reason}]: ${r.divergencePixels.toFixed(2)}px divergence`
    )
    if (criticals.length > 10) lines.push(`• …and ${criticals.length - 10} more`)
    const payload: SlackPayload = {
      channel: this.options.channel,
      username: this.options.username ?? 'Measurement Validator',
      icon_emoji: this.options.iconEmoji ?? ':rotating_light:',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🚨 ${criticals.length} Critical Measurement Divergence(s)`,
          },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: lines.join('\n') },
        },
      ],
      text: `${criticals.length} critical divergences detected`,
    }
    await postToSlack(payload, this.options.webhookUrl)
  }
}
