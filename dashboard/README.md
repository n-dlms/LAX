# LAX Dashboard

Terminal-style web UI for LAX — a fork of [thtauhid/terminal-portfolio](https://github.com/thtauhid/terminal-portfolio)
(restyled and extended; the embedded CLI backend is shared with the standalone
`lax` binary in `../src/cli/`).

## Run

```bash
cd dashboard
npm install
npx vite --host 127.0.0.1   # http://localhost:5173
```

## What it shows

- Live health factor, collateral/debt (same Aave reads as the CLI)
- Mitigation progress with per-step tx hashes
- KeeperHub execution records with `app.keeperhub.com/runs/<id>` links
- An embedded `lax` terminal (command registry in `src/cli/registry.ts`)

The CLI command core lives in `../src/cli/` and is shared with the standalone
binary; the dashboard only contributes the React terminal rendering. Commands
that need the KeeperHub API key go through `api/keeperhub-proxy.ts` (deployed
as an edge function) — no key ships in the bundle.
