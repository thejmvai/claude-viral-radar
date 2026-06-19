# Workflow — MCP-free scrape (raw CDP)

> WAT workflow SOP. Tool: `scripts/scrape-cdp.mjs`. Agent: read this, then call the tool.

## Objective
Run Step 2 detection (per tracked handle) **without the chrome-devtools MCP** — it disconnects
mid-session and blocks scrapes. This tool talks to a normal Chrome over the raw DevTools Protocol
(dependency-free: Node's global `WebSocket` + `fetch`), scrapes each tracked handle's `/reels/` grid,
fetches each viral candidate's `og:description` for exact engagement, computes preliminary metrics with
`score.mjs`, and writes a **work-list** the existing enrichment pipeline (Step 3) consumes unchanged.

This is the **reliable, scriptable spine** that also makes unattended/scheduled refreshes possible
(see `workflows/scheduled-refresh.md` once built). ScrapeCreators/Apify remain the high-fidelity
alternatives (browser scraping gets fragile engagement; IG often hides like counts).

## Prerequisite — launch Chrome with remote debugging (one-time per session)
Close Chrome fully, then relaunch it logged into Instagram with the debug port open:

- **macOS:**
  `/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 "--remote-allow-origins=*" --user-data-dir="$HOME/.viral-radar-chrome"`
- **Linux:** `google-chrome --remote-debugging-port=9222 "--remote-allow-origins=*" --user-data-dir="$HOME/.viral-radar-chrome"`
- **Windows:** `"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="%USERPROFILE%\.viral-radar-chrome"`

(zsh/bash: quote `"--remote-allow-origins=*"` so the shell doesn't glob-expand the `*`.)

Then log into Instagram in that window. (`--remote-allow-origins=*` is required on Chrome ≥111 or the
DevTools WebSocket refuses connections. The dedicated `--user-data-dir` keeps a stable logged-in profile
without touching your main Chrome.)

## Inputs
- `viral-radar-out/<niche>.config.json` — `trackedHandles`, `scrapeTargetPerHandle`, `minPerHandle`,
  `viralThreshold`, `velocityThreshold`, `velocityWindowHours`, `qualityGateLikeRate`.
- The seen-cache `viral-radar-out/cache/<niche>-seen.json` (to keep only NEW viral reels).

## Tool
```
node scripts/scrape-cdp.mjs [--niche=ai-claude] [--port=9222] [--target=36] [--out=<path>] [--handles=a,b]
```
Writes `viral-radar-out/worklist-<niche>.json` — the per-reel work-list (same fields Step 2 produced
inline), grouped by handle, plus per-handle coverage and an under-floor list.

## Pipeline handoff
The work-list item shape mirrors the dataset's pre-enrichment reel fields, so Step 3 enrichment is
unchanged: `{ shortcode, url, handle, creatorName, followers, discoveredVia:"tracked", postedAt,
ageHoursAtCatch, viralReason, metrics:{views,likes,comments}, likeRate, commentRate, breakout,
creatorMedianViews, reachMultiple, signalScore, qualityFlag }`.

## Live-gated DOM parts (validate against real Instagram)
Three browser-evaluated reads can only be confirmed on the live site (selectors drift) — they are
isolated as named expression constants in the tool:
1. **Grid scrape** — `a[href*="/reel/"]` tiles → shortcode + view-count overlay text.
2. **Follower count** — `a[href*="/followers/"] span[title]` (exact count in `title`), text fallback.
3. **og:description** — `meta[property="og:description"]` on each reel page (server-rendered, reliable),
   parsed by `parseOgDescription` from `parse-og.mjs`.
If a selector breaks, fix it here and note the working selector + date below.

## Edge cases / learnings
- **Cannot connect to :9222** — Chrome isn't running with the flag, or origins aren't allowed. Print the
  exact launch command and stop.
- **Login wall** — og:description / grid come back empty. Tell the user to log into Instagram in the
  debug window, then re-run.
- **Velocity-band reels** (`[velocityThreshold, viralThreshold)`) need `postedAt` for the age rule, so the
  tool fetches og for every candidate at/above `velocityThreshold` before classifying with `isViral`.
- **Throttling — the real operational risk (learned from live testing 2026-06-19).** After a burst of
  rapid requests (≈10+ in a couple of minutes), Instagram serves the **profile header only** — the reels
  grid never renders, so `og:description`/followers still parse but the grid is empty. This reads as
  "0 reels" when it's really a soft-block. The tool guards against it: it polls + reloads for the grid,
  paces handles (`--gap`, default 4000ms) and reel fetches, and flags `throttled` per handle (`header
  loaded but grid empty`) in the work-list + a `⚠` summary line. **For the full tracked list (27 handles)
  this matters a lot** — keep `--gap` generous, and if many handles come back `throttled`, stop and re-run
  later (the cooldown is minutes+). The very first request of a fresh session reliably returns the full grid.
- **Quoting `--remote-allow-origins=*`:** in zsh the `*` must be quoted (`"--remote-allow-origins=*"`) or
  the shell glob-expands it and Chrome never gets the flag.
- **Raw CDP proves fiddly?** Fallback documented: `npm i chrome-remote-interface` + a `package.json` in the
  skill. Prefer staying dependency-free.

## Wire-in
SKILL.md Step 2 gets an alternative **"Step 2 (no MCP)"** path that runs this tool and reads its work-list.
