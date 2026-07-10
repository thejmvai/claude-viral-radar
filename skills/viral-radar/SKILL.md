---
name: viral-radar
description: "Detect and analyze viral reels in a niche; build a local Viral Radar dataset + dark HTML report. Use for a viral scrape or to refresh viral radar."
---

# /viral-radar — Orchestration Runbook

All outputs are written under `viral-radar-out/` in the **user's current working directory** (never into `dashboard/`). Scripts live in the directory where this SKILL.md resides, under `scripts/`.

---

## First run — onboarding

1. **First-run check:** check whether `viral-radar-out/.onboarded` exists in the user's current working directory. If it does **not** exist, run the steps below before anything else. If it **does** exist, skip this section entirely and continue to Step 1.

2. **Browser/MCP check (non-blocking):** the MCP is only ONE of three ways to scrape — the skill also runs
   MCP-free (Step 2 no-MCP via a debug Chrome, or the paid Step 2 API path). Check whether tools named
   `mcp__chrome-devtools__*` exist (e.g. attempt `mcp__chrome-devtools__list_pages`). If they are **not**
   available, do **NOT** stop — tell the user:

   > "The chrome-devtools MCP isn't installed — that's fine. This skill can scrape without it (a debug
   > Chrome via `scripts/scrape-cdp.mjs`, or the paid ScrapeCreators path). If you'd like the MCP anyway,
   > add it once with `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest` and restart
   > Claude Code."

   Then continue to the next onboarding step.

3. **Instagram login (only if the MCP is available):** use `mcp__chrome-devtools__navigate_page` to open `https://www.instagram.com/` in the automation browser. Use `mcp__chrome-devtools__take_screenshot` to check whether a login wall is visible (i.e. the user is not logged in). If Instagram is showing a login screen or gate, tell the user:

   > "Instagram needs a one-time login. A browser window should be open — please log in to Instagram with your own account there. Your login is only used locally to read pages; it is never stored by this skill. Let me know when you're logged in."

   Wait for the user to confirm they are logged in before continuing. **If the MCP is not available, skip
   this step** — on the no-MCP path the login happens in the debug Chrome instead (see `workflows/scrape-cdp.md`).

4. **Ask the niche:** ask the user: "What niche are you in? (e.g. AI tools, fitness, personal finance, cooking)" Once they answer, do the following:
   - Create `viral-radar-out/` if it does not exist.
   - Copy `config/ai-claude.example.config.json` (located next to this SKILL.md) into `viral-radar-out/<niche>.config.json`.
   - Set the `niche` field to the user's niche slug (lowercase, hyphenated) and the `label` field to a readable display name.
   - If the niche is not `ai-claude` (i.e. the default config values may not apply), ask: "What view count should we use as the viral threshold for your niche? (default: 100000) And any seed hashtags?" Update `viralThreshold` and `seedHashtags` in the config with their answers.
   - Leave `trackedHandles: []` and `inspirationHandles: []` in the config (in-niche competitors and out-of-niche format references are both added via `/viral-competitor`; see `workflows/inspiration-lane.md`).

5. **Finish:** write an empty file at `viral-radar-out/.onboarded` (create it with no content). Tell the user:

   > "You're set up. Add competitors with `/viral-competitor @handle1 @handle2 ...`, or run `/viral-radar` to scrape everyone on your list."

   Then **STOP** — the first run ends after onboarding. The user adds competitors next.

---

## Step 1 — Config bootstrap

1. Determine the target niche by reading `viral-radar-out/<niche>.config.json` (use the filename that exists; if multiple exist, pick the most recently modified, or prompt if ambiguous).
2. Read the config. If `trackedHandles` is an empty array, tell the user: "No handles to track yet. Run `/viral-competitor @handle1 @handle2` to add competitors." Stop here.
3. Load the seen-cache at `viral-radar-out/cache/<niche>-seen.json` (create as `{}` if missing).

---

## Step 1.5 — Choose the data source (ASK EVERY RUN)

Before scraping, **always ask the user which data source to use** — the two paths differ in cost and speed, so the user decides each run:

> "How do you want to pull this run?
> **1) Paid (fast)** — ScrapeCreators API for the competitor reels (no Instagram throttle, exact metrics) **plus** `/last30days` for cross-platform 'Hot across the niche' trends. Costs ScrapeCreators credits.
> **2) Free (slower)** — Chrome scraping through your logged-in Instagram. $0, but Instagram soft-blocks rapid scraping, so a full tracked list is paced and can take ~20-40 min and sometimes needs a cooldown + retry."

Route on their answer:

- **Paid →** run **Step 2 (paid API)** below (`scripts/scrape-api.mjs`). **SPEND GATE:** ScrapeCreators is paid — confirm the user is OK spending credits before the first live call (per CLAUDE.md). Then optionally pull trends in Step 6 via `/last30days` (skip with a one-line note if that skill isn't installed).
- **Free →** run **Step 2 (no MCP)** below (`scripts/scrape-cdp.mjs`), or the MCP path (Step 2) if the chrome-devtools MCP is connected. **Set the delay expectation up front** and follow the throttle discipline in `workflows/scrape-cdp.md` (pace with `--gap`, do **not** probe-then-immediately-full-run, and if many handles come back `throttled` stop and retry after a cooldown).

Both paths write the **same** `viral-radar-out/worklist-<niche>.json` shape, so Step 3 enrichment onward is identical regardless of which source the user picked.

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

## Step 2 (no MCP) — raw CDP scraper (alternative to the MCP path above)

If the chrome-devtools MCP is unavailable or keeps disconnecting, run Step 2 with the dependency-free
CDP scraper instead. Workflow SOP: `workflows/scrape-cdp.md`.

1. Have the user launch Chrome with remote debugging **and logged into Instagram** (one-time per session;
   exact per-OS command is in `workflows/scrape-cdp.md` — macOS:
   `/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 "--remote-allow-origins=*" --user-data-dir="$HOME/.viral-radar-chrome"`).
2. Run:
   ```
   node scripts/scrape-cdp.mjs --niche=<niche>
   ```
   It iterates `config.trackedHandles` **plus `config.inspirationHandles`** (the out-of-niche lane —
   see `workflows/inspiration-lane.md`), opens each `/<handle>/reels/`, scrolls to `scrapeTargetPerHandle`,
   scrapes shortcodes + view counts, reads the follower count, fetches each viral candidate's
   `og:description` for exact likes/comments/postedAt, applies the same viral gate (`isViral`) and metrics
   (`score.mjs`), and writes the **work-list** to `viral-radar-out/worklist-<niche>.json`. Reels from an
   inspiration handle carry `trackingCategory: "inspiration"` so Step 5 can exclude them from synthesis.
3. Read `worklist-<niche>.json` and treat its `reels` array as the **work-list** for the rest of the
   pipeline — its item shape matches what the MCP Step 2 produced inline, so **continue at Step 3
   enrichment unchanged.**

This removes the MCP dependency and is the spine for unattended/scheduled refreshes. Browser scraping
still gets fragile engagement (IG hides like counts), so ScrapeCreators/Apify remain the high-fidelity
alternatives.

---

## Step 2 (paid API) — ScrapeCreators reels (the "paid (fast)" path)

The fast alternative to chrome scraping, chosen in Step 1.5. It pulls each tracked handle's reels
straight from the ScrapeCreators `user/reels` endpoint — **no browser, no Instagram throttle**, exact
engagement. Workflow SOP: `workflows/scrape-api.md`. **SPEND GATE: this costs ScrapeCreators credits —
confirm before the first live call.**

1. Ensure `SCRAPECREATORS_API_KEY` resolves (env, `./.claude/last30days.env`, or `~/.config/last30days/.env`).
2. Run:
   ```
   node scripts/scrape-api.mjs --niche=<niche>
   ```
   It iterates `config.trackedHandles` **plus `config.inspirationHandles`** (same lanes as the chrome
   path), fetches each handle's reels, applies the same viral gate (`viralReasonFor`/`isViral`) and
   metrics (`score.mjs`) via the shared `buildWorklistItem`, and writes the **work-list** to
   `viral-radar-out/worklist-<niche>.json`. Inspiration reels carry `trackingCategory: "inspiration"`.
3. Read `worklist-<niche>.json` and **continue at Step 3 enrichment unchanged** — the item shape is
   identical to the chrome path's.

Then add cross-platform trends (the other half of the "paid (fast)" choice): in Step 6, run
`/last30days <niche>` and attach the result as `crossPlatform` (skip with a one-line note if `/last30days`
isn't installed).

---

## Step 2.5 — Discovery (find NEW creators to track)

Tracked-handle scraping only ever sees creators you already listed. Discovery finds **new** ones by hashtag. Run it when `config.discoveryEnabled` is true and a `SCRAPECREATORS_API_KEY` is available (resolved from the env, `./.claude/last30days.env`, or `~/.config/last30days/.env`):

```
node scripts/discover.mjs --niche=<niche>
```

It searches `config.seedHashtags` on Instagram via the ScrapeCreators API, groups reels by creator, drops handles already in `config.trackedHandles` (and any already in the dataset), and ranks the rest by reach + niche presence + recency (reusing `recencyScore` from `scripts/score.mjs`). It writes:

- `viral-radar-out/discovery-<niche>.json` — ranked new creators, each with their best reel, view counts, and profile URL.
- A console summary plus a ready-to-paste `/viral-competitor @h1 @h2 ...` line for the strongest finds.

Surface the top 5-8 suggestions to the user and let them pick. **Do not auto-add** discovered handles — discovery suggests, the user decides with `/viral-competitor`. Creators with fewer than `config.discoveryMinNicheReels` (default 2) niche reels are flagged `singleMatch` (likely off-niche — caught on a single tagged reel, e.g. a comedy account whose one reel mentions "Claude"); they're score-penalized, ranked below qualified creators, and kept out of the ready-to-paste line. **Only surface `singleMatch` creators with an explicit "verify" caveat.** If no `SCRAPECREATORS_API_KEY` is configured, skip this step (print a one-line note that discovery needs the free key from https://app.scrapecreators.com) and continue.

---

## Step 3 — Tier 2 Enrichment

Process only **new** work-list reels, capped at `config.enrichmentCapPerRun` (default 60). Order them so **every channel gets its floor first, then quality fills the rest**:

1. Group the work-list by handle and sort each group by `signalScore` descending.
2. **Round-robin pass:** take the top `config.minPerHandle` (default 5) reels from each handle (or all of them if a handle has fewer). This guarantees ≥5 from each channel whenever that many cleared the gate.
3. **Fill pass:** if the cap is not yet reached, add the remaining work-list reels by `signalScore` descending until you hit `config.enrichmentCapPerRun`.

Enrich reels in that combined order (floor reels first).

For each reel:

1. **Download media:** run `node scripts/extract-media.mjs <reelUrl> viral-radar-out/frames/<shortcode>`. This writes `1.jpg`–`4.jpg` (storyboard frames), `hook-0.jpg`/`hook-1.jpg`/`hook-2.jpg` (the literal first 0/1/2 seconds, for sharper hook study), and `audio.m4a`. Record the hook frames on the reel as `hookFrames: ["frames/<shortcode>/hook-0.jpg", ...]` (relative to `viral-radar-out/`) — the report shows them as a filmstrip in the Hook section. Also record the returned `durationSec` (rounded) as `metrics.durationSec` — the validator requires it on every reel. **Instagram gates media downloads behind login:** if yt-dlp fails with "rate-limit reached or login required", set `VR_YTDLP_COOKIES_FROM_BROWSER=chrome` in the environment (any browser profile that is logged into Instagram; `VR_YTDLP_COOKIES_FILE` takes a Netscape cookies.txt instead). The scheduled refresh sets this automatically.
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
6. Build the complete `ViralReel` object. Set `storyboard[n].frame` to `frames/<shortcode>/<n+1>.jpg` and `hookFrames` to the `frames/<shortcode>/hook-*.jpg` paths (both relative to `viral-radar-out/`).

### Step 3.75 — Niche relevance filter (kills the off-topic mess)

A tracked creator's viral reel is not automatically niche signal (their gym reel going viral teaches the
AI radar nothing). After enrichment, tag every new reel with `tagRelevance` from `scripts/relevance.mjs`
(config `nicheKeywords` + `nicheMinKeywordHits`, word-boundary matching over caption + hook + transcript;
one hit on a `nicheStrongKeywords` entry — names that alone prove the niche, e.g. "claude" — passes
outright, so a reel that only ever says "Claude" can't be flagged off-topic):

- `offTopic: false` → continues to Step 4 ranking as normal (keeps its `nicheRelevance` evidence).
- `offTopic: true` → goes to the dataset's **`offTopic` array** (NOT `reels`): kept and rendered in its own
  report section, but out of the ranking, synthesis, digest, Ideator, and analytics.
- Inspiration-lane reels are never flagged (they are off-niche on purpose).

Workflow SOP: `workflows/relevance-filter.md`.

---

## Step 4 — Quality gate + ranking

1. Reels where `qualityFlag === "boosted"` go into `quarantined` (not ranked, excluded from synthesis).
2. Rank gate-passing reels with `rankReels(reels, { now, recencyWeight: config.recencyWeight, halfLifeDays: config.recencyHalfLifeDays })` from `scripts/score.mjs`. This blends `signalScore` (quality) with `recencyScore` (time of post) so fresh, high-signal reels rise to the top; it writes `recencyScore`, `rankScore`, and a sequential `rank` onto each reel.
3. **Keep the full library.** Every gate-passing reel that was enriched belongs in `reels` — do **not** collapse to a curated "one per creator" or top-N subset. The report is meant to be a rich, browsable library (≥5 per channel), not a highlight reel. The only reels excluded from `reels` are the `quarantined` ones.

---

## Step 5 — Synthesis

Regenerate `nicheSynthesis` from the gate-passing reels — but **exclude any reel with `trackingCategory === "inspiration"`**. Those are out-of-niche creators tracked only for their hook/format/editing (see `workflows/inspiration-lane.md`); their *topics* would skew the niche's trend analysis (and the downstream Ideator), so synthesize over `reels.filter((r) => r.trackingCategory !== "inspiration")` only. The inspiration reels still stay in `reels` and render in the report (badged) — they're just not a source of niche lessons.

- `whatsWorking`: 3–5 replicable, actionable plays distilled from the top reels (e.g. "Teach one named skill, not a list of tips")
- `topPatterns`: array of `{ pattern, count }` — structural patterns detected across reels (e.g. "claim-proof-cta")
- `summary`: 1-sentence strategic takeaway for the niche

---

## Step 5.5 — Analytics (the numbers layer)

Compute the deterministic performance benchmarks and attach them as `ds.analytics`:

```
node scripts/analytics.mjs viral-radar-out/<niche>.json
```

`buildAnalytics` groups the on-niche library (inspiration + off-topic excluded) into a format
leaderboard (count / median views / avg signal / gate share), gate-vs-organic lift, duration sweet
spots, per-creator scorecards, and hook stats. Attach the printed JSON as `ds.analytics` — the report
renders it as the **📊 Analytics** tab and the /#insights page consumes the same block. Narrate insights
from these numbers; never hand-count. Workflow SOP: `workflows/analytics.md`.

---

## Step 6 — Write outputs

1. Build the full `ViralDataset` object: `{ niche, label, generatedAt, nicheSynthesis, reels, quarantined, offTopic, analytics, recommendations }` (copy `label` from the config — the report header and Telegram digest use it; quarantined/offTopic reels carry no `rank`, that's expected). `recommendations` = the top ≤5 **qualified** creators from the latest `discovery-<niche>.json` (never `singleMatch` ones), each `{ handle, profile, bestViews, relevantReels, reason }` — these are SURFACED in the report + digest for Jameson to decide on; the skill never adds a creator itself.
   - **Optional cross-platform trends:** to add a "Hot across the niche" section below the reels, run `/last30days <niche>` (free sources suffice) and attach the top items as `crossPlatform: { window, summary, themes: [...], sources: [{ platform, icon, items: [{ title, url, metric }] }] }`. `render-report.mjs` renders it automatically when present — competitor reels above, niche-wide chatter (Reddit, TikTok, YouTube, GitHub) below.
2. **Validate first:** run `node scripts/validate.mjs viral-radar-out/<niche>.config.json` and the dataset object (pipe JSON or write a temp file). If validation errors are returned, print them and **abort the write**.
3. Write `viral-radar-out/<niche>.json` (overwrite).
4. Update the seen-cache at `viral-radar-out/cache/<niche>-seen.json`: add each processed shortcode with `{ firstSeen: <ISO timestamp>, enriched: true }`.
5. Render the HTML report into a **date-stamped archive folder** so every run is cataloged by date and old runs stay around to compare against. **Render each destination separately — do NOT `cp` one render to the other**: the archive lives two levels below `frames/`, so its image paths need the `--frames-base` prefix while `report-latest.html` needs none (copying one to the other location breaks every photo):
   ```
   mkdir -p viral-radar-out/reports/<YYYY-MM-DD>
   node scripts/render-report.mjs viral-radar-out/<niche>.json viral-radar-out/reports/<YYYY-MM-DD>/report.html --frames-base=../../frames/
   node scripts/render-report.mjs viral-radar-out/<niche>.json viral-radar-out/report-latest.html
   cp viral-radar-out/<niche>.json viral-radar-out/reports/<YYYY-MM-DD>/<niche>.json
   ```
   If multiple runs happen on the same day, append a `-HHMM` suffix to the folder so earlier runs are not overwritten.
   **Routine check (every render, non-negotiable):** `render-report.mjs` automatically verifies every image/link ref after writing (via `check-report.mjs`) and exits 2 listing the broken refs if any asset does not resolve. A failing render is a STOP — fix the cause (usually a wrong `--frames-base`) and re-render; never hand the user a report that failed the check. To audit any existing report: `node scripts/check-report.mjs <report.html>`.
6. **Retention cleanup (every run — old files must not pile up):**
   ```
   node scripts/cleanup.mjs --niche=<niche>
   ```
   Keeps the newest `config.keepArchives` (default 5) report archives, deletes frame folders no longer
   referenced by the live dataset or any kept archive, and prunes stale `worklist-*.json` (>7d) and
   `.bak-*` folders (>30d). Use `--dry-run` to preview. Workflow SOP: `workflows/cleanup.md`.
7. Tell the user: "Open `viral-radar-out/report-latest.html` for the latest, or browse `viral-radar-out/reports/<date>/` for past runs. Print to PDF from Chrome for a shareable dossier."

---

## Step 7 — Summary output

Print a `SUMMARY:` line with:
- How many new viral reels were detected
- How many were enriched vs. partial
- How many were quarantined
- **Per-channel coverage**: reels kept per handle, and call out any handle that came in under `config.minPerHandle`
- The top 3 by `rankScore` (handle + rankScore + postedAt)

### Step 7.5 — Telegram digest (optional)

Push the run digest to the user's phone. Workflow SOP: `workflows/telegram-digest.md`.

```
node scripts/notify-telegram.mjs --niche=<niche>
```

- If `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` resolve (env, `./.claude/viral-radar.env`, or
  `~/.config/viral-radar/.env`), it delivers the digest (top reels by rank, per-channel coverage, top "Hot
  across the niche" items) to Telegram. On success it prints `Telegram digest sent (message_id …)`.
- If no credentials are found, it just prints the digest and exits cleanly — **never fails the run.** Tell
  the user once that they can set it up via `guides/setup-telegram.md` to get it on their phone.
- Use `--dry-run` to preview the digest without sending.

---

## Step 8 — Ideator (optional: insight → reel ideas in his voice)

Turn the radar into reel ideas. Workflow SOP: `workflows/ideator.md`. **GATE: ideas are his-voice content
— produce a DRAFT for Jameson's review, never auto-publish.**

1. **Grounding pack:** `node scripts/ideator.mjs viral-radar-out/<niche>.json` prints `buildIdeaContext`
   (top on-niche reels + patterns + whatsWorking + trends — inspiration reels excluded). That's the
   evidence each idea must cite.
2. **Generate:** read `/Users/jamesonchua/Claude/AIOS/references/voice.md`, then write **5–10 ideas**, each
   `{ hook (≤12 words), angle, format, grounding:{type,ref,note} }`, strictly in his voice (openers +
   devices, SIMPLICITY, no em dashes, no fabricated scale), each grounded in a real radar/trend/pattern.
3. **Validate:** write the ideas to `viral-radar-out/ideas-<niche>.json` as `{ niche, generatedAt, ideas }`,
   then `node scripts/ideator.mjs viral-radar-out/<niche>.json viral-radar-out/ideas-<niche>.json`. Fix any
   errors (hook length, missing fields, missing grounding, em dashes) and re-validate until `OK`.
4. **Show in the report (optional):** attach `ds.ideas = ideas` and re-render — `render-report.mjs` shows
   an **"💡 Ideas" tab**.
5. **Review gate:** present the ideas to Jameson as a draft. Do not post/schedule/publish until he approves.
6. **Remix mode (rescript a specific winner):** `node scripts/ideator.mjs viral-radar-out/<niche>.json --remix=<shortcode>` prints that reel's beat structure, hook mechanics, and why-it-worked as a context pack. Write the remix from it — same skeleton, his topic, his voice — as a DRAFT for review.

## Scope notes

- **Data source is the user's choice every run (Step 1.5):** *free* chrome scraping (Step 2 / Step 2 no-MCP) or *paid* ScrapeCreators reels (Step 2 paid API). Both produce the same work-list; the rest of the pipeline is identical.
- **Tracked-handle scraping** (Step 2, free) is the spine: it runs via the chrome-devtools browser / raw CDP, no API key needed, but Instagram soft-blocks rapid bursts (pace it — see `workflows/scrape-cdp.md`).
- **Paid reel scrape** (Step 2 paid API): `scripts/scrape-api.mjs` pulls reels via the ScrapeCreators `user/reels` endpoint — fast, no IG throttle, costs credits. Spend-gated.
- **Discovery** (Step 2.5) is optional and additive: it finds NEW creators by hashtag via the ScrapeCreators API. Enable with `discoveryEnabled: true` plus a `SCRAPECREATORS_API_KEY`. Discovery only *suggests* handles; the user adds the good ones with `/viral-competitor`.

---

## Requirements

- **Claude Code** (this skill is invoked via `/viral-radar`)
- **chrome-devtools MCP** — for Instagram scraping (Step 2). Or skip it: use **Step 2 (no MCP)** with `scripts/scrape-cdp.mjs` + a Chrome launched on `--remote-debugging-port=9222` (dependency-free, no MCP).
- **yt-dlp** + **ffmpeg** on PATH — for media extraction. Instagram now requires an authenticated session to download reel media: have a browser profile logged into Instagram and set `VR_YTDLP_COOKIES_FROM_BROWSER=chrome` (or `VR_YTDLP_COOKIES_FILE=<cookies.txt>`) when running enrichment by hand — `refresh.mjs` sets it automatically.
- **Whisper** (optional) — `pip install openai-whisper` — or set `GROQ_API_KEY` / `OPENAI_API_KEY` for cloud transcription
- **ScrapeCreators API key** (optional) — powers Step 2.5 discovery **and the paid Step 2 reel scrape** (`scripts/scrape-api.mjs`); free tier at https://app.scrapecreators.com, set `SCRAPECREATORS_API_KEY`. Paid calls are spend-gated.
- **nexlev MCP** (optional) — fallback enrichment when local media extraction fails
