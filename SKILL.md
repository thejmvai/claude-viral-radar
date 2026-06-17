---
name: viral-radar
description: "Detect and analyze viral reels in a niche; build a local Viral Radar dataset + dark HTML report. Use for a viral scrape or to refresh viral radar."
---

# /viral-radar — Orchestration Runbook

All outputs are written under `viral-radar-out/` in the **user's current working directory** (never into `dashboard/`). Scripts live in the directory where this SKILL.md resides, under `scripts/`.

---

## Step 1 — First run / config bootstrap

1. Determine the target niche (default: `ai-claude`).
2. Check whether `viral-radar-out/<niche>.config.json` exists.
   - If **missing**: create `viral-radar-out/` and copy the bundled `config/<niche>.example.config.json` into `viral-radar-out/<niche>.config.json`. If no example config exists for this niche, prompt once for: `viralThreshold`, `velocityThreshold`, `velocityWindowHours`, and `seedHashtags`, then write a new config file with `trackedHandles: []`.
3. Read the config. If `trackedHandles` is an empty array, tell the user: "No handles to track yet. Open `viral-radar-out/<niche>.config.json`, add the Instagram handles you want to monitor to `trackedHandles`, then re-run `/viral-radar`." Stop here.
4. Load the seen-cache at `viral-radar-out/cache/<niche>-seen.json` (create as `{}` if missing).

---

## Step 2 — Tier 1 Detection (per tracked handle)

For each handle in `config.trackedHandles`:

1. Open `https://www.instagram.com/<handle>/reels/` with the chrome-devtools MCP (`navigate_page`).
2. Scroll the grid (use `evaluate_script` to scroll and wait for new tiles) until at least 12–20 reels are loaded or no more load.
3. Scrape grid tiles: extract `shortcode` and view count text (e.g. "1.2M", "847K") for each tile using `evaluate_script`.
4. Read the exact follower count from the profile header using `evaluate_script`.
5. Compute `creatorMedianViews` as the **median** of all loaded grid view counts.
6. For each scraped reel:
   a. Parse the view text to a number (handle K/M suffixes).
   b. If views are in the range `[config.velocityThreshold, config.viralThreshold)`: fetch the reel page (`navigate_page` to `https://www.instagram.com/reel/<shortcode>/`) and extract the `og:description` meta tag content. Run `node scripts/parse-og.mjs` (or import its `parseOgDescription` function via inline Node execution) to get `postedAt`. Compute `ageHours` from `postedAt` to now. Apply velocity rule: viral if `ageHours < config.velocityWindowHours`.
   c. If views are `>= config.viralThreshold`: mark as viral (absolute), no age check needed.
   d. Apply `isViral` from `scripts/score.mjs` to confirm.
7. Diff against the seen-cache. New viral shortcodes not yet in the cache form the **work-list**.
8. For each work-list reel, compute preliminary metrics using `scripts/score.mjs`:
   - `likeRate(likes, views)`, `commentRate(comments, views)` — likes/comments available from og:description
   - `breakout(views, creatorMedianViews)`
   - `reachMultiple(views, followers)`
   - `qualityFlag(likeRate)` — flags reels below `config.qualityGateLikeRate` as "boosted"
   - `signalScore({ likeRate, commentRate, ctaType, breakout, followers })`

---

## Step 3 — Tier 2 Enrichment

Process only **new** work-list reels, capped at `config.enrichmentCapPerRun`, sorted by `signalScore` descending (highest first).

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
2. Sort gate-passing reels by `signalScore` descending.
3. Assign `rank` 1..N sequentially.

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
- The top 3 by signal score (handle + score)

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
