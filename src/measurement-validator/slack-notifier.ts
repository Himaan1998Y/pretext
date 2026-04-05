// Slack webhook notifier for the measurement-validator.
//
// Sends structured notifications to a Slack channel when validation runs
// complete, regressions are detected, or critical issues are found.
// Uses incoming webhooks — no OAuth, no bot tokens required.

import type {
  PerformanceRegression,
  SlackAttachment,
  SlackBlock,
  SlackMessage,
  ValidationSummary,
} from './types.js'

export type SlackNotifierConfig = {
  webhookUrl: string
  channel?: string
  username?: string
  iconEmoji?: string
  /** Minimum severity to post; defaults to 'warning' */
  minSeverity?: 'ok' | 'warning' | 'critical'
}

export type SlackNotifierOptions = {
  runId: string
  branch?: string
  commitSha?: string
  prUrl?: string
}

export class SlackNotifier {
  private config: SlackNotifierConfig

  constructor(config: SlackNotifierConfig) {
    this.config = config
  }

  async sendValidationSummary(
    summary: ValidationSummary,
    regressions: PerformanceRegression[],
    opts: SlackNotifierOptions,
  ): Promise<void> {
    const hasCritical = summary.critical > 0 || regressions.some((r) => r.severity === 'critical')
    const hasWarning = summary.warnings > 0 || regressions.some((r) => r.severity === 'warning')

    if (this.config.minSeverity === 'critical' && !hasCritical) return
    if (this.config.minSeverity !== 'ok' && !hasCritical && !hasWarning) return

    const color = hasCritical ? '#dc3545' : hasWarning ? '#ffc107' : '#28a745'
    const statusIcon = hasCritical ? '🔴' : hasWarning ? '🟡' : '✅'
    const statusLabel = hasCritical ? 'CRITICAL' : hasWarning ? 'WARNING' : 'PASSED'

    const fields: SlackAttachment['fields'] = [
      { title: 'Pass Rate', value: `${(summary.passRate * 100).toFixed(1)}%`, short: true },
      { title: 'Total Tests', value: String(summary.total), short: true },
      { title: 'Critical', value: String(summary.critical), short: true },
      { title: 'Warnings', value: String(summary.warnings), short: true },
      { title: 'Avg Delta', value: `${summary.avgDeltaPercent.toFixed(2)}%`, short: true },
      { title: 'Max Delta', value: `${summary.maxDeltaPercent.toFixed(2)}%`, short: true },
    ]

    if (opts.branch) {
      fields.push({ title: 'Branch', value: opts.branch, short: true })
    }
    if (opts.commitSha) {
      fields.push({ title: 'Commit', value: opts.commitSha.slice(0, 8), short: true })
    }

    let regressionText = ''
    if (regressions.length > 0) {
      regressionText = '\n*Performance Regressions:*\n' +
        regressions
          .map(
            (r) =>
              `${r.severity === 'critical' ? '🔴' : '🟡'} ${r.language}: ` +
              `${r.baselineMs.toFixed(2)}ms → ${r.currentMs.toFixed(2)}ms ` +
              `(+${r.changePercent.toFixed(1)}%)`,
          )
          .join('\n')
    }

    const prLink = opts.prUrl ? ` | <${opts.prUrl}|View PR>` : ''
    const text =
      `${statusIcon} Measurement Validation *${statusLabel}*${prLink}\n` +
      `Run: \`${opts.runId}\`` +
      regressionText

    const message: SlackMessage = {
      text: `Measurement Validation ${statusLabel}`,
      attachments: [
        {
          color,
          title: `Measurement Validation ${statusLabel}`,
          text,
          fields,
          footer: 'pretext measurement-validator',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }

    if (this.config.channel) {
      Object.assign(message, { channel: this.config.channel })
    }
    if (this.config.username) {
      Object.assign(message, { username: this.config.username })
    }
    if (this.config.iconEmoji) {
      Object.assign(message, { icon_emoji: this.config.iconEmoji })
    }

    await this.post(message)
  }

  async sendRegressionAlert(
    regressions: PerformanceRegression[],
    opts: SlackNotifierOptions,
  ): Promise<void> {
    if (regressions.length === 0) return

    const critical = regressions.filter((r) => r.severity === 'critical')
    const warnings = regressions.filter((r) => r.severity === 'warning')

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '⚠️ Performance Regression Alert' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `Run: \`${opts.runId}\``,
            opts.branch ? `Branch: \`${opts.branch}\`` : null,
            opts.commitSha ? `Commit: \`${opts.commitSha.slice(0, 8)}\`` : null,
          ]
            .filter(Boolean)
            .join(' | '),
        },
      },
      { type: 'divider' },
    ]

    if (critical.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*🔴 Critical Regressions:*\n' +
            critical
              .map(
                (r) =>
                  `• ${r.language} (${r.metric}): ` +
                  `${r.baselineMs.toFixed(2)}ms → ${r.currentMs.toFixed(2)}ms ` +
                  `(+${r.changePercent.toFixed(1)}%)`,
              )
              .join('\n'),
        },
      })
    }

    if (warnings.length > 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            '*🟡 Warnings:*\n' +
            warnings
              .map(
                (r) =>
                  `• ${r.language} (${r.metric}): ` +
                  `${r.baselineMs.toFixed(2)}ms → ${r.currentMs.toFixed(2)}ms ` +
                  `(+${r.changePercent.toFixed(1)}%)`,
              )
              .join('\n'),
        },
      })
    }

    await this.post({ text: '⚠️ Performance Regression Alert', blocks })
  }

  async sendDailySummary(
    stats: {
      totalRuns: number
      avgPassRate: number
      criticalCount: number
      topLanguages: string[]
    },
  ): Promise<void> {
    const statusIcon = stats.avgPassRate >= 0.99 ? '✅' : stats.avgPassRate >= 0.95 ? '🟡' : '🔴'

    const message: SlackMessage = {
      text: `${statusIcon} Daily Measurement Validation Summary`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${statusIcon} Daily Measurement Validation Summary`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              `*Runs today:* ${stats.totalRuns}`,
              `*Avg pass rate:* ${(stats.avgPassRate * 100).toFixed(1)}%`,
              `*Critical issues:* ${stats.criticalCount}`,
              `*Languages tested:* ${stats.topLanguages.join(', ')}`,
            ].join('\n'),
          },
        },
      ],
    }

    await this.post(message)
  }

  private async post(message: SlackMessage): Promise<void> {
    const res = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(
        `Slack webhook request failed: ${res.status} ${res.statusText}\n${body}`,
      )
    }
  }
}

/** Build a SlackNotifier from the SLACK_WEBHOOK_URL environment variable. */
export function createSlackNotifierFromEnv(): SlackNotifier | null {
  const url = process.env['SLACK_WEBHOOK_URL']
  if (!url) return null
  return new SlackNotifier({
    webhookUrl: url,
    channel: process.env['SLACK_CHANNEL'],
    username: process.env['SLACK_USERNAME'] ?? 'pretext-validator',
    iconEmoji: process.env['SLACK_ICON_EMOJI'] ?? ':bar_chart:',
    minSeverity: (process.env['SLACK_MIN_SEVERITY'] as 'ok' | 'warning' | 'critical') ?? 'warning',
  })
}
