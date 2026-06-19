# Workflow — Scheduled auto-refresh (Full)

> WAT workflow SOP. Tool: `scripts/refresh.mjs` + a launchd job. Agent: this runs UNATTENDED; a human
> sets it up once. Goal: wake up to a fresh digest with no laptop step.

## Objective
On a schedule (default daily), run the **full** Viral Radar pipeline and push the Telegram digest — no
manual step. "Full" means real enrichment (Claude vision writes hooks/storyboards/why-it-works on new
reels), so it uses Claude usage each run.

## How it works
`refresh.mjs` is a thin orchestrator (run by launchd):
1. **Ensure Chrome** is up on `:9222` with the persisted, logged-in profile (`$HOME/.viral-radar-chrome`);
   launch it if not, wait until the DevTools endpoint answers.
2. **Run the pipeline headless:** `claude -p "<refresh prompt>" --dangerously-skip-permissions` from the
   project dir. The prompt tells the skill to run a full `/viral-radar` using the **Step 2 (no MCP) CDP
   scraper** (the chrome-devtools MCP isn't loaded headless), then enrich → rank → render → **digest**
   (Step 7.5 sends it). The skill does all the work; `refresh.mjs` just drives it.
3. **Alert on failure:** if Chrome can't be reached or `claude` exits non-zero, send a Telegram alert
   (reusing `notify-telegram.mjs`) so a silent failure doesn't go unnoticed.

## Tool
```
node scripts/refresh.mjs [--niche=ai-claude] [--port=9222] [--project-dir=<cwd>]
   [--profile=$HOME/.viral-radar-chrome] [--model=<id>] [--no-launch-chrome]
```
Run by the launchd job `com.jamesonc.viral-radar-refresh` (template in `guides/`).

## Setup
See `guides/setup-scheduled-refresh.md`: fill the plist (abs paths + schedule + project dir), one-time log
into Instagram in the debug Chrome profile, `launchctl load` it. Cadence via `StartCalendarInterval`.

## Cost (Full)
Each run spends Claude usage (vision enrichment of new reels). On a subscription it draws down your plan;
on API billing it's real per-run cost. Scraping + Telegram are free. To run free, use a Lite refresh
instead (not built — would skip the Claude enrichment step).

## Edge cases / learnings
- **Throttling at scale:** a full 27-handle scrape in one burst can trip Instagram's header-only throttle
  (see `scrape-cdp.md`). The scraper paces (`--gap`) and flags throttled handles; throttled handles simply
  yield no new reels that run and recover next run.
- **Login expiry:** if the Instagram session in the profile logs out, the scrape returns empty/login-wall.
  `refresh.mjs` surfaces this via the failure alert; re-log-in in the debug Chrome profile.
- **launchd PATH is minimal:** the plist sets `PATH` (node/claude bins) and `WorkingDirectory` (project
  dir) explicitly, or `claude`/`node` won't resolve and `viral-radar-out/` won't be found.
- **`--dangerously-skip-permissions`** lets the unattended run execute the skill's scripts without prompts.
  Acceptable because it runs your own vetted skill on your own machine; documented in the setup guide.
- **Unattended verification:** the live end-to-end (real headless run, tokens, un-throttled IG) is gated on
  Jameson — build + unit-test the orchestration offline, then he runs it once manually before loading launchd.

## Wire-in
Standalone (launchd-driven). Reuses the skill pipeline + `notify-telegram.mjs`; no SKILL.md step change.
