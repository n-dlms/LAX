# Operator Alerts — Discord, Slack & Custom Webhooks (Optional)

LAX can message you the moment something happens: a health-factor trigger, a
gate block, a fire, or a failure. This feature is **entirely optional** — LAX
runs perfectly without it, and alerts are best-effort by design: a broken or
missing webhook never blocks or delays a mitigation.

## How it works

Set one environment variable (`LAX_ALERT_WEBHOOK`) and every fire path in LAX —
the autopilot daemon, the CLI engage path, and the demo command — pushes a
notification to that URL. LAX auto-detects the target:

| Endpoint | Format you get |
|----------|----------------|
| Discord webhook | Native rich embed — title, colored bar (green = executed, red = blocked), position/HF/repay/execution link |
| Slack webhook | Formatted text message |
| Anything else | Plain `{"text": …}` payload |

Events alerted: **trigger** (position entered the danger zone), **gate-blocked**
(safety system refused a fire), **webhook-fired** (mitigation executed), and
**fire-failed** (infrastructure problem — you want to know immediately).

## Setup — Discord (2 minutes)

1. In your Discord server, choose or create a channel for alerts (e.g. `#lax-alerts`)
2. Click the **channel name → Edit Channel (⚙) → Integrations → Webhooks → New Webhook**
3. Optionally rename it to **LAX Guardian** and give it an avatar
4. Click **Copy Webhook URL** — it looks like
   `https://discord.com/api/webhooks/1234567890/AbCdEf…`
5. Add it to your `.env` (repo root; the file is gitignored and never committed):

   ```
   LAX_ALERT_WEBHOOK=https://discord.com/api/webhooks/1234567890/AbCdEf…
   ```

6. Test it:

   ```console
   $ lax alert --test
   Test alert delivered to Discord — check the channel.
   ```

   A green "⚡ LAX executed a mitigation" embed should appear in the channel.

## Setup — Slack (2 minutes)

1. Slack → your workspace → **Apps → Incoming Webhooks** (add if not installed)
2. **Add New Webhook to Workspace**, pick the target channel
3. Copy the URL (`https://hooks.slack.com/services/T…/B…/…`) into
   `LAX_ALERT_WEBHOOK` in `.env`
4. `lax alert --test` and check the channel

## Setup — anything else

Any endpoint that accepts a JSON `POST` with `{"text": "…"}` works — your own
receiver, n8n, a pager relay, etc. LAX sends:

```json
{ "text": "⚡ LAX executed a mitigation · position fork@base-fork · HF 1.0431 · repay 32.32 USDC · execution 9bc31o…" }
```

## Managing it day to day

```console
$ lax alert            # is it configured? which kind? endpoint (token hidden)
$ lax alert --test     # send a live test message
```

Check status without sending anything:

```console
$ lax alert
Alerts: enabled (Discord)
  endpoint: https://discord.com/api/webhooks/123456/… (token hidden)

Events alerted: trigger · gate-blocked · webhook-fired · fire-failed
Test the channel: lax alert --test
```

## Security notes

- The webhook URL can post to your channel — treat it like a secret. Keep it in
  `.env` (gitignored); never commit it or paste it in issues/screenshots.
- `lax alert` displays the URL with the token portion hidden.
- Alerts are **outbound only**: LAX sends to your endpoint and reads nothing
  back. A malicious response cannot affect a mitigation.
- The alert request times out after 5 seconds and failures are logged to stderr
  — they never touch the mitigation pipeline.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `lax alert --test` says not configured | `LAX_ALERT_WEBHOOK` unset or `.env` not loaded | add the key, run from the repo root |
| Says delivered but nothing in Discord | wrong channel permissions, or the webhook was deleted | recreate the webhook, copy a fresh URL |
| `[lax] alert not delivered: … endpoint 404` | webhook deleted or URL truncated | recreate and re-paste the full URL |
| `[lax] alert not delivered: … unreachable` | no network / DNS / firewall | alerts are optional by design — mitigation continues normally |
