# Setup — Scheduled auto-refresh (Full, macOS launchd)

Wake up to a fresh Viral Radar digest. A launchd job runs the full pipeline (scrape → enrich → rank →
render → digest) on a schedule. **Cost:** the enrichment step uses Claude each run (your plan's usage, or
API dollars). Prereqs: P1 Telegram digest set up (`setup-telegram.md`) and the CDP scraper working
(`scrape-cdp.md`).

## 1. Prove it works manually first (do NOT skip)
Before automating, run it once by hand so you know the unattended job will succeed:

```
# Chrome on :9222, logged into Instagram (refresh.mjs will also launch it if needed):
node skills/viral-radar/scripts/refresh.mjs --niche=ai-claude --project-dir="$PWD"
```
This launches the pipeline headless and the digest should land on your phone. If it errors, fix that
before loading launchd (an unattended job that fails silently is worse than none).

## 2. Fill the plist template
Copy `guides/com.jamesonc.viral-radar-refresh.plist` and replace the placeholders. Find your values:

```
which node          # -> __NODE__         e.g. /usr/local/bin/node
dirname $(which claude)   # -> __NPM_BIN__  e.g. /Users/you/.npm-global/bin
echo "$PWD"         # -> __PROJECT_DIR__  (run from your project root, the folder with viral-radar-out)
```
`__REFRESH_MJS__` = `<PROJECT_DIR>/.claude/skills/viral-radar/scripts/refresh.mjs` (the local install copy).
Adjust the `StartCalendarInterval` (default daily 07:00) if you want a different time.

## 3. Install it
```
cp <your-filled>.plist ~/Library/LaunchAgents/com.jamesonc.viral-radar-refresh.plist
launchctl load   ~/Library/LaunchAgents/com.jamesonc.viral-radar-refresh.plist
launchctl list | grep viral-radar          # confirm it's registered
launchctl start  com.jamesonc.viral-radar-refresh   # optional: trigger one run now
```
Logs: `viral-radar-out/refresh.log`. To change/remove:
```
launchctl unload ~/Library/LaunchAgents/com.jamesonc.viral-radar-refresh.plist
```

## Notes & gotchas
- **Mac must be awake** at the scheduled time. launchd runs missed jobs at next wake, but for reliability
  pick a time the Mac is on (or use `caffeinate` / Energy Saver wake schedule).
- **Instagram login** lives in the `~/.viral-radar-chrome` profile and persists across reboots, but can
  expire. If a run alerts that it failed, open that Chrome profile and re-log-in.
- **PATH:** launchd has a minimal environment — that's why the plist sets `PATH` (for `claude`) and uses an
  absolute `node`. If `claude` "not found" appears in the log, fix `__NPM_BIN__`.
- **Throttling:** the full 27-handle scrape paces itself; handles that get header-only throttled just yield
  nothing that run and recover next time (see `scrape-cdp.md`).
- **`--dangerously-skip-permissions`** is used so the unattended run can execute the skill's own scripts
  without prompts. It runs only your vetted skill on your machine; review `refresh.mjs` if unsure.
