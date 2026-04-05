// Slack notifier for the measurement-validator.
//
// Sends webhook notifications to a Slack channel when validation runs
// complete or when regressions are detected.  Uses Slack's Incoming
// Webhooks API — no Slack SDK dependency needed.
//
// Usage:
//   import { SlackNotifier } from './slack-notifier.js'
//   const notifier = new SlackNotifier(process.env.SLACK_WEBHOOK_URL)
//   await notifier.notifyRegressionReport(report)

import type { PerformanceReport, RegressionReport } from './types.js'

export type SlackBlock =
  | { type: 'header'; text: { type: 'plain_text'; text: string } }
  | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
  | { type: 'divider' }

export type SlackPayload = {
  text: string
  blocks?: SlackBlock[]
}

export class SlackNotifier {
  private webhookUrl: string

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl
  }

  /** Low-level send: POST a SlackPayload to the configured webhook URL. */
  async send(payload: SlackPayload): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new Error(
        `Slack webhook returned ${response.status}: ${await response.text()}`,
      )
    }
  }

  /** Notify about a completed regression detection report. */
  async notifyRegressionReport(report: RegressionReport): Promise<void> {
    const totalIssues =
      report.accuracyRegressions.length + report.performanceRegressions.length

    const statusIcon = report.hasBlocker ? '❌' : totalIssues > 0 ? '⚠️' : '✅'
    const statusText = report.hasBlocker
      ? 'Critical regressions detected — build blocked'
      : totalIssues > 0
        ? `${totalIssues} regression(s) detected`
        : 'All checks passed'

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${statusIcon} Measurement Validator — ${statusText}`,
        },
      },
    ]

    if (report.accuracyRegressions.length > 0) {
      const lines = report.accuracyRegressions.map(
        r =>
          `• *${r.browser}*: ${r.currentMatchCount}/${r.currentTotal} matches ` +
          `(Δ −${r.delta}, ${r.severity})`,
      )
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Accuracy*\n${lines.join('\n')}` } })
    }

    if (report.performanceRegressions.length > 0) {
      const lines = report.performanceRegressions.map(r => {
        const sign = r.deltaPct >= 0 ? '+' : ''
        return (
          `• *[${r.browser}]* ${r.label}: ` +
          `${r.currentMs.toFixed(3)}ms (${sign}${r.deltaPct.toFixed(1)}%, ${r.severity})`
        )
      })
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Performance*\n${lines.join('\n')}` },
      })
    }

    blocks.push({ type: 'divider' })
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `_Generated at ${report.generatedAt}_` },
    })

    await this.send({ text: `${statusIcon} Measurement Validator: ${statusText}`, blocks })
  }

  /** Notify about a performance tracking report. */
  async notifyPerformanceReport(report: PerformanceReport): Promise<void> {
    const degraded = report.metrics.filter(m => m.trend === 'degrading')
    const statusIcon = report.regressionCount > 0 ? '⚠️' : '✅'
    const statusText =
      report.regressionCount > 0
        ? `${report.regressionCount} performance regression(s) — ${report.browser}`
        : `Performance OK — ${report.browser}`

    const lines = degraded.map(m => {
      const sign = m.deltaPct >= 0 ? '+' : ''
      return `• ${m.label}: ${m.currentMs.toFixed(3)}ms (${sign}${m.deltaPct.toFixed(1)}%)`
    })

    const body =
      lines.length > 0
        ? `*Degraded benchmarks*\n${lines.join('\n')}`
        : '✅ All benchmarks within expected range.'

    await this.send({
      text: `${statusIcon} Performance report (${report.browser}): ${statusText}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${statusIcon} Performance Report — ${report.browser}` },
        },
        { type: 'section', text: { type: 'mrkdwn', text: body } },
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `_Generated at ${report.generatedAt}_` },
        },
      ],
    })
  }

  /** Send a plain text message. */
  async notifyText(text: string): Promise<void> {
    await this.send({ text })
  }
}

/**
 * Convenience factory that reads the webhook URL from `SLACK_WEBHOOK_URL`
 * environment variable and returns null if it is not set.
 */
export function createSlackNotifierFromEnv(): SlackNotifier | null {
  const url = process.env['SLACK_WEBHOOK_URL']
  if (url == null || url.trim() === '') return null
  return new SlackNotifier(url)
}
