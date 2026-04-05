# Slack Integration Guide

The measurement-validator can send Slack notifications for validation results,
performance regressions, and daily summaries using incoming webhooks.

## Prerequisites

You need a Slack workspace where you can create an incoming webhook. No bot tokens
or OAuth flows are required.

## Setup

### 1. Create a Slack app with an incoming webhook

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name it (e.g. `pretext-validator`) and pick your workspace
4. Under **Features**, click **Incoming Webhooks** → toggle **Activate Incoming Webhooks** on
5. Click **Add New Webhook to Workspace** → choose a channel → **Allow**
6. Copy the webhook URL: `https://hooks.slack.com/services/T.../B.../...`

### 2. Set environment variables

```bash
# Required
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T.../B.../..."

# Optional
export SLACK_CHANNEL="#quality-gates"        # Override destination channel
export SLACK_USERNAME="pretext-validator"    # Display name
export SLACK_ICON_EMOJI=":bar_chart:"        # Icon
export SLACK_MIN_SEVERITY="warning"          # 'ok' | 'warning' | 'critical'
```

For GitHub Actions, add `SLACK_WEBHOOK_URL` as a repository secret:

```
Settings → Secrets and variables → Actions → New repository secret
Name:  SLACK_WEBHOOK_URL
Value: https://hooks.slack.com/services/...
```

## Usage

### Manual notification from CLI

```bash
# Send notification after a performance trends run
bun run scripts/performance-trends.ts --slack-notify

# Include branch/commit context
bun run scripts/performance-trends.ts \
  --slack-notify \
  --branch=main \
  --commit=abc123def
```

### Programmatic usage

```typescript
import { SlackNotifier } from './src/measurement-validator/slack-notifier.js'
import { createSlackNotifierFromEnv } from './src/measurement-validator/slack-notifier.js'

// From environment variables
const notifier = createSlackNotifierFromEnv()
if (notifier) {
  await notifier.sendValidationSummary(summary, regressions, {
    runId: 'run-abc123',
    branch: 'main',
    commitSha: 'abc123def',
    prUrl: 'https://github.com/org/repo/pull/42',
  })
}

// Explicit configuration
const notifier = new SlackNotifier({
  webhookUrl: process.env.SLACK_WEBHOOK_URL!,
  channel: '#quality-gates',
  username: 'pretext-validator',
  iconEmoji: ':bar_chart:',
  minSeverity: 'warning',   // only notify on warnings or critical
})
```

## Message types

### Validation summary

Sent after each validation run. Includes pass rate, critical/warning counts,
deltas, branch, and commit.

Color coding:
- 🟢 Green — all passed
- 🟡 Yellow — warnings present
- 🔴 Red — critical issues

### Regression alert

Sent specifically for performance regressions. Lists each regression with language,
metric, baseline vs current timing, and percentage change.

### Daily summary

Sent on the scheduled daily run. Shows run count, average pass rate, critical issue
count, and languages tested.

## Controlling notification frequency

Use `SLACK_MIN_SEVERITY` to control which events trigger a Slack message:

| Value | Sends notifications for |
|-------|------------------------|
| `ok` | Every run (even if all pass) |
| `warning` | Warnings and critical (default) |
| `critical` | Only critical regressions |

## Troubleshooting

**"Slack webhook request failed: 403"**
- The webhook URL has been revoked. Generate a new one from the Slack app settings.

**"Slack webhook request failed: 404"**
- The app or webhook no longer exists. Recreate it.

**No messages arriving**
- Check `SLACK_WEBHOOK_URL` is set in the environment / CI secrets
- Check `SLACK_MIN_SEVERITY` — if set to `critical`, warnings are silently skipped
- Verify the channel still exists in your workspace
