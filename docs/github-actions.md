# GitHub Actions Integration Guide

The measurement-validator GitHub Actions workflow automatically validates canvas measurements
against browser DOM on every push and pull request, detects performance regressions, and posts
results as PR comments.

## Setup

### 1. Add the workflow

The workflow file is already included at `.github/workflows/measurement-validation.yml`.
It triggers on:

- **Push** to `main` or `release/*` branches (when source files change)
- **Pull requests** targeting `main`
- **Daily schedule** at 06:00 UTC (canary run)
- **Manual dispatch** (with optional baseline update and Slack notification)

### 2. Configure Slack notifications (optional)

Add a repository secret named `SLACK_WEBHOOK_URL` with your Slack incoming webhook URL.

```
Settings → Secrets and variables → Actions → New repository secret
Name: SLACK_WEBHOOK_URL
Value: https://hooks.slack.com/services/T.../B.../...
```

See [`slack-integration.md`](./slack-integration.md) for full Slack setup details.

## How it works

```
Push / PR opened
     │
     ▼
Type-check + Unit tests
     │
     ▼
Performance tracking check
  ├── Reads .measurement-baseline.json
  ├── Runs synthetic timing measurements
  ├── Compares against baseline
  └── Writes .perf-report.json
     │
     ▼
Upload artifact (.perf-report.json, retained 90 days)
     │
     ├─ [Pull request] ──→ Post PR comment with report
     │
     ├─ [Critical regression] ──→ Fail build + error annotation
     │
     └─ [Schedule / manual] ──→ Send Slack notification
```

## PR Comments

On every pull request, the workflow posts (or updates) a comment with:

- ✅ "No performance regressions detected" — or —
- 🔴 Critical regressions with language, metric, and % change
- 🟡 Warnings with the same detail
- A table of current metrics per language

The comment is updated in-place on subsequent pushes to the same PR.

## Updating the baseline

The performance baseline is stored in `.measurement-baseline.json` and committed to the
repository so baseline changes are reviewable in PRs.

To update it manually:

```bash
# Via GitHub Actions (recommended)
# Trigger "Measurement Validation" → Run workflow → enable "Update the performance baseline"

# Or locally
bun run scripts/performance-trends.ts --update-baseline
git add .measurement-baseline.json
git commit -m "chore: update measurement performance baseline"
```

## Regression thresholds

| Change | Severity | Effect |
|--------|----------|--------|
| < 20%  | None     | Pass   |
| ≥ 20%  | Warning  | Logged |
| ≥ 50%  | Critical | Build fails |

Thresholds can be adjusted in `src/measurement-validator/performance-tracker.ts`:

```typescript
const REGRESSION_WARNING_THRESHOLD = 0.20  // 20%
const REGRESSION_CRITICAL_THRESHOLD = 0.50 // 50%
```

## Artifacts

Performance reports are uploaded as workflow artifacts named
`performance-report-<run_id>` and retained for 90 days. Download them from
the Actions run page or via the GitHub CLI:

```bash
gh run download <run-id> --name performance-report-<run-id>
```

## Workflow inputs (manual dispatch)

| Input | Default | Description |
|-------|---------|-------------|
| `update_baseline` | `false` | Commit updated baseline after run |
| `slack_notify` | `true` | Send Slack notification |
