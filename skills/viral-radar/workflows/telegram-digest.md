# Workflow — Telegram digest

> WAT workflow SOP. Tool: `scripts/notify-telegram.mjs`. Agent: read this, then call the tool.

## Objective
After a radar run, push a compact digest of the run to Jameson's phone via a Telegram bot — better
delivery than opening an HTML file. **Optional and non-blocking:** if no bot credentials are configured,
the step prints the digest to stdout and exits cleanly. It never fails a radar run.

## Inputs
- A finished dataset at `viral-radar-out/<niche>.json` (the `ViralDataset`: `niche`, `label`,
  `generatedAt`, `reels` with `rankScore`/`metrics.views`/`handle`/`hook`/`url`, optional `crossPlatform`).
- Credentials, resolved in order: `process.env` → `./.claude/viral-radar.env` → `~/.config/viral-radar/.env`:
  - `TELEGRAM_BOT_TOKEN` — from @BotFather.
  - `TELEGRAM_CHAT_ID` — the chat to deliver to (see `guides/setup-telegram.md`).

## Tool
```
node scripts/notify-telegram.mjs [--niche=ai-claude] [--dataset=<path>] [--top=5] [--trends=3] [--dry-run]
```
- `--dry-run` (or missing credentials): print the digest to stdout, send nothing.
- Exit 0 on success, on dry-run, and on missing-credentials (optional step). Exit non-zero only on a
  real send failure (bad token, network) when credentials WERE provided.

## What the digest contains
- Header: `🛰️ Viral Radar — <label>` + the run date (from `generatedAt`).
- **Top N reels** by `rankScore`: tappable hook link → reel, with `handle · <views> views · rank <score>`.
- **Coverage:** channel count · reel count, then channels with ≥2 kept reels (the most productive), and a
  `+N more with 1` tail. Calls out any channel under `minPerHandle` when that floor is passed in — but the
  under-floor callout **collapses to a count when it would list >8 handles** (most tracked channels simply
  don't have N viral hits, so a full list is noise on a phone; learned from the real ai-claude run, where
  22 of 27 channels were single-hit).
- **🔥 Hot across the niche:** top N `crossPlatform` items (platform icon + tappable title), falling back
  to `crossPlatform.themes` when no per-source items exist.

## Formatting decision (read before changing)
Sends with Telegram **`parse_mode: HTML`**, NOT Markdown. Reason: handles contain `_`, `.`, `@`
(e.g. `@raul_the_rockstar`) which break legacy Markdown and require fragile escaping in MarkdownV2.
HTML only needs `& < >` escaped in text (plus `"` in `href`), so links + bold stay robust. The handoff
said "Markdown"; HTML is the correctness-driven swap. Messages are truncated safely under Telegram's
4096-char cap.

## Edge cases / learnings
- **Empty dataset / no reels:** still sends a valid header + "no reels this run" so a run is never silent.
- **No `crossPlatform`:** the Hot section is omitted.
- **Missing credentials:** print digest, exit 0 (the step is optional). Tell the user how to set them.
- **Telegram API error with creds present:** surface the `description` field from the API response and
  exit non-zero so the run summary shows the failure.
- **`fetch failed` / ETIMEDOUT while `curl https://api.telegram.org` works (live 2026-07-05):**
  api.telegram.org publishes AAAA records; on a machine with a broken IPv6 route Node resolves IPv6
  first and times out where curl falls back to IPv4. Fixed in the tool — it calls
  `dns.setDefaultResultOrder("ipv4first")` at startup. If a similar error ever hits another script's
  `fetch`, the same one-liner (or running Node with `--dns-result-order=ipv4first`) is the fix.

## Wire-in
SKILL.md Step 7 (Summary output): after printing the console SUMMARY, if credentials resolve, run the
tool to deliver the digest; otherwise note it's available and skip.
