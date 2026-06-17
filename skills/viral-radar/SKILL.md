---
name: viral-radar
description: "Detect and analyze viral reels in a niche; build a local Viral Radar dataset + dark HTML report. Use for a viral scrape or to refresh viral radar."
---

# /viral-radar — Orchestration Runbook

All outputs are written under `viral-radar-out/` in the **user's current working directory** (never into `dashboard/`). Scripts live in the directory where this SKILL.md resides, under `scripts/`.

---

## First run — onboarding

1. **First-run check:** check whether `viral-radar-out/.onboarded` exists in the user's current working directory. If it does **not** exist, run the steps below before anything else. If it **does** exist, skip this section entirely and continue to Step 1.

2. **Browser/MCP check:** this skill drives an automation browser via the **chrome-devtools MCP**. Verify it is available by checking whether you have tools named `mcp__chrome-devtools__*` (e.g. attempt `mcp__chrome-devtools__list_pages`). If the tools are **not** available, tell the user verbatim:

   > "The automation browser needs the chrome-devtools MCP, which isn't installed yet. Add it once by running this in your terminal:
   > `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest`
   > then fully restart Claude Code and run /viral-radar again."

   Then **STOP** (do not continue any further).

3. **Instagram login:** use `mcp__chrome-devtools__navigate_page` to open `https://www.instagram.com/` in the automation browser. Use `mcp__chrome-devtools__take_screenshot` to check whether a login wall is visible (i.e. the user is not logged in). If Instagram is showing a login screen or gate, tell the user:

   > "Instagram needs a one-time login. A browser window should be open — please log in to Instagram with your own account there. Your login is only used locally to read pages; it is never stored by this skill. Let me know when you're logged in."

   Wait for the user to confirm they are logged in before continuing.

4. **Ask the niche:** ask the user: "What niche are you in? (e.g. AI tools, fitness, personal finance, cooking)" Once they answer, do the following:
   - Create `viral-radar-out/` if it does not exist.
   - Copy `config/ai-claude.example.config.json` (located next to this SKILL.md) into `viral-radar-out/<niche>.config.json`.
   - Set the `niche` field to the user's niche slug (lowercase, hyphenated) and the `label` field to a readable display name.
   - If the niche is not `ai-claude` (i.e. the default config values may not apply), ask: "What view count should we use as the viral threshold for your niche? (default: 100000) And any seed hashtags?" Update `viralThreshold` and `seedHashtags` in the config with their answers.
   - Leave `trackedHandles: []` in the config (competitors are added via `/viral-competitor`).

5. **Finish:** write an empty file at `viral-radar-out/.onboarded` (create it with no content). Tell the user:

   > "You're set up. Add competitors with `/viral-competitor @handle1 @handle2 ...`, or run `/viral-radar` to scrape everyone on your list."

   Then **STOP** — the first run ends after onboarding. The user adds competitors next.

---

## Step 1 — Config bootstrap

1. Determine the target niche by reading `viral-radar-out/<niche>.config.json` (use the filename that exists; if multiple exist, pick the most recently modified, or prompt if ambiguous).
2. Read the config. If `trackedHandles` is an empty array, tell the user: "No handles to track yet. Run `/viral-competitor @handle1 @handle2` to add competitors." Stop here.
3. Load the seen-cache at `viral-radar-out/cache/<niche>-seen.json` (create as `{}` if missing).

---

## Step 2 — Tier 1 Detection (per tracked handle)

For each handle in `config.trackedHandles`:

1. Open `https://www.instagram.com/<handle>/reels/` with the chrome-devtools MCP (`navigate_page`).
2. Scroll the grid (use `evaluate_script` to scroll and wait for new tiles) until at least `config.scrapeTargetPerHandle` (default 36) reels are loaded or no more load. **Funnel wide:** the goal is to surface ≥ `config.minPerHandle` viral reels per creator, so keep scrolling if you have not yet found that many viral candidates and tiles are still loading.
3. Scrape grid tiles: extract `shortcode` and view count text (e.g. "1.2M", "847K") for each tile using `evaluate_script`.
4. Read the exact follower count from the profile header using `evaluate_script`.
5. Compute `creatorMedianViews` as the **median** of all loaded grid view counts.
6. For each scraped reel:
   a. Parse the view text to a number (handle K/M suffixes).
   b. If views are in the range `[config.velocityThreshold, config.viralThreshold)`: fetch the reel page (`navigate_page` to `https://www.instagram.com/reel/<shortcode>/`) and extract the `og:description` meta tag content. Run `node scripts/parse-og.mjs` (or import its `parseOgDescription` function via inline Node execution) to get `postedAt`. Compute `ageHours` from `postedAt` to now. Apply velocity rule: viral if `ageHours < config.velocityWindowHours`.
   c. If views are `>= config.viralThreshold`: mark as viral (absolute), no age check needed.
   d. Apply `isViral` from `scripts/score.mjs` to confirm.
7. Diff against the seen-cache. New viral shortcodes not yet in the cache form the **work-list**. Keep **every** new viral reel per handle — do not trim to one or a "best" pick here. If a handle yields fewer than `config.minPerHandle` viral reels, note it in the run summary (its grid may simply not have that many recent hits); never drop a handle that does clear the bar to make room for others.
8. For each work-list reel, compute preliminary metrics using `scripts/score.mjs`:
   - `likeRate(likes, views)`, `commentRate(comments, views)` — likes/comments available from og:description
   - `breakout(views, creatorMedianViews)`
   - `reachMultiple(views, followers)`
   - `qualityFlag(likeRate)` — flags reels below `config.qualityGateLikeRate` as "boosted"
   - `signalScore({ likeRate, commentRate, ctaType, breakout, followers })`

---

## Step 3 — Tier 2 Enrichment

Process only **new** work-list reels, capped at `config.enrichmentCapPerRun` (default 60). Order them so **every channel gets its floor first, then quality fills the rest**:

1. Group the work-list by handle and sort each group by `signalScore` descending.
2. **Round-robin pass:** take the top `config.minPerHandle` (default 5) reels from each handle (or all of them if a handle has fewer). This guarantees ≥5 from each channel whenever that many cleared the gate.
3. **Fill pass:** if the cap is not yet reached, add the remaining work-list reels by `signalScore` descending until you hit `config.enrichmentCapPerRun`.

Enrich reels in that combined order (floor reels first).

For each reel:

1. **Download media:** run `node scripts/extract-media.mjs <reelUrl> viral-radar-out/frames/<shortcode>`. This writes `1.jpg`–`4.jpg` (storyboard frames) and `audio.m4a`.
2. **Transcribe audio:** if `whisper` is available on PATH, run `whisper viral-radar-out/frames/<shortcode>/audio.m4a --model base.en --output_format txt`. Read the `.txt` output. Alternatively, if a `GROQ_API_KEY` or `OPENAI_API_KEY` environment variable is set, use the respective Whisper API endpoint.
3. **Analyze frames with Claude vision:** read the 4 `.jpg` frames and ask Claude to produce:
   - `storyboard`: array of `{ timestamp, role, caption }` for each frame (role = Hook / Proof / CTA / etc., caption = what's happening on screen + any on-screen text)
   - `format`: a short format tag (e.g. "Talking-head + screen demo", "UGC reaction", "Text-on-screen")
4. **Synthesize:** from the transcript, storyboard, og caption, and metrics, write:
   - `hook`: the opening line or on-screen text (≤ 12 words)
   - `hookDelivery`: `"spoken"` | `"text"` | `"spoken+text"`
   - `ctaType`: `"comment-to-DM"` if caption/transcript contains a "comment <word>" gate, else `"organic"`
   - `breakdown`: 2–3 sentence structural analysis
   - `whyItWorks`: 1–2 sentence strategic insight
5. **Fallback:** if `extract-media.mjs` fails (yt-dlp/ffmpeg not available or download error) OR transcription fails: call the nexlev MCP `watch_instagram_video_and_ask` with the reel URL and ask the same questions (storyboard captions, format, hook, hookDelivery, ctaType, breakdown, whyItWorks). Set `enrichmentEngine: "nexlev"`. If `watch_instagram_video_and_ask` also fails, store a partial record (fill unknown fields with `""`) and continue to the next reel.
6. Build the complete `ViralReel` object. Set `storyboard[n].frame` to `frames/<shortcode>/<n+1>.jpg` (relative to `viral-radar-out/`).

---

## Step 4 — Quality gate + ranking

1. Reels where `qualityFlag === "boosted"` go into `quarantined` (not ranked, excluded from synthesis).
2. Rank gate-passing reels with `rankReels(reels, { now, recencyWeight: config.recencyWeight, halfLifeDays: config.recencyHalfLifeDays })` from `scripts/score.mjs`. This blends `signalScore` (quality) with `recencyScore` (time of post) so fresh, high-signal reels rise to the top; it writes `recencyScore`, `rankScore`, and a sequential `rank` onto each reel.
3. **Keep the full library.** Every gate-passing reel that was enriched belongs in `reels` — do **not** collapse to a curated "one per creator" or top-N subset. The report is meant to be a rich, browsable library (≥5 per channel), not a highlight reel. The only reels excluded from `reels` are the `quarantined` ones.

---

## Step 5 — Synthesis

Regenerate `nicheSynthesis` from the gate-passing reels:

- `whatsWorking`: 3–5 replicable, actionable plays distilled from the top reels (e.g. "Teach one named skill, not a list of tips")
- `topPatterns`: array of `{ pattern, count }` — structural patterns detected across reels (e.g. "claim-proof-cta")
- `summary`: 1-sentence strategic takeaway for the niche

---

## Step 6 — Write outputs

1. Build the full `ViralDataset` object: `{ niche, generatedAt, nicheSynthesis, reels, quarantined }`.
2. **Validate first:** run `node scripts/validate.mjs viral-radar-out/<niche>.config.json` and the dataset object (pipe JSON or write a temp file). If validation errors are returned, print them and **abort the write**.
3. Write `viral-radar-out/<niche>.json` (overwrite).
4. Update the seen-cache at `viral-radar-out/cache/<niche>-seen.json`: add each processed shortcode with `{ firstSeen: <ISO timestamp>, enriched: true }`.
5. Render the HTML report:
   ```
   node scripts/render-report.mjs viral-radar-out/<niche>.json viral-radar-out/report-<YYYY-MM-DD>.html
   ```
   Then copy it to `viral-radar-out/report-latest.html`.
6. Tell the user: "Open `viral-radar-out/report-latest.html` in your browser, or print to PDF from Chrome for a shareable dossier."

---

## Step 7 — Summary output

Print a `SUMMARY:` line with:
- How many new viral reels were detected
- How many were enriched vs. partial
- How many were quarantined
- **Per-channel coverage**: reels kept per handle, and call out any handle that came in under `config.minPerHandle`
- The top 3 by `rankScore` (handle + rankScore + postedAt)

---

## Scope notes (v1)

- Hashtag discovery is **OFF** (`discoveryEnabled: false`). Only tracked handles are scraped.
- `discoveryEnabled: true` is reserved for v2 once the tracked spine is validated.

---

## Requirements

- **Claude Code** (this skill is invoked via `/viral-radar`)
- **chrome-devtools MCP** — for Instagram scraping
- **yt-dlp** + **ffmpeg** on PATH — for media extraction
- **Whisper** (optional) — `pip install openai-whisper` — or set `GROQ_API_KEY` / `OPENAI_API_KEY` for cloud transcription
- **nexlev MCP** (optional) — fallback enrichment when local media extraction fails
