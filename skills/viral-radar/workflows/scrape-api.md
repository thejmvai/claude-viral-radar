# Workflow — paid scrape (ScrapeCreators API)

> WAT workflow SOP. Tool: `scripts/scrape-api.mjs`. Agent: read this, then call the tool.

## Objective
Run Step 2 detection (per tracked handle) over the **ScrapeCreators API** instead of the browser. This
is the "paid (fast)" path the user can pick in SKILL.md Step 1.5. Chrome scraping (`scrape-cdp.mjs`) is
free but Instagram soft-blocks rapid requests; this path pulls each handle's reels straight from the
ScrapeCreators `user/reels` endpoint, so there is **no browser and no IG throttle** — at the cost of
ScrapeCreators credits.

It writes the **same** work-list shape `scrape-cdp.mjs` does (it reuses `buildWorklistItem`,
`resolveScrapeList`, `median`, `viralReasonFor`), so Step 3 enrichment consumes it unchanged.

## SPEND GATE (read first)
ScrapeCreators is **paid** — every handle costs credits. Per CLAUDE.md, **do not spend without flagging
first.** Confirm the user is OK spending before the first live run. The tool prints
`ScrapeCreators credits remaining: …` after each run so the user can watch the balance.

## Prerequisite — API key
`SCRAPECREATORS_API_KEY` must resolve from one of (in order): `process.env`, `./.claude/last30days.env`,
`~/.config/last30days/.env` (same resolver as `discover.mjs`). If absent, the tool errors and points to
https://app.scrapecreators.com (or the free chrome path).

## Inputs
- `viral-radar-out/<niche>.config.json` — `trackedHandles`, `inspirationHandles`, `scrapeTargetPerHandle`,
  `viralThreshold`, `velocityThreshold`, `velocityWindowHours`, `qualityGateLikeRate`, `minPerHandle`.
  Covers **both** lanes (in-niche `trackedHandles` + out-of-niche `inspirationHandles`); inspiration reels
  are stamped `trackingCategory: "inspiration"` (see `workflows/inspiration-lane.md`).
- The seen-cache `viral-radar-out/cache/<niche>-seen.json` (keeps only NEW viral reels).

## Tool
```
node scripts/scrape-api.mjs [--niche=ai-claude] [--handles=a,b] [--target=36] [--out=<path>]
```
Writes `viral-radar-out/worklist-<niche>.json` (`source: "scrapecreators"`) — the per-reel work-list
(same fields the chrome path produces), per-handle coverage, an under-floor list, and `creditsRemaining`.

## Pipeline handoff
Identical to `workflows/scrape-cdp.md`: the work-list item shape mirrors the dataset's pre-enrichment
reel fields, so **continue at Step 3 enrichment unchanged.**

## Live-gated parts (validate against the live API)
The exact ScrapeCreators response envelope can only be confirmed on the live API, so two pieces are
isolated for easy fixing:
1. **Endpoint** — `SC_USER_REELS = https://api.scrapecreators.com/v1/instagram/user/reels` (the stable
   per-handle endpoint per CLAUDE.md; query `?handle=&amount=`). Auth header `x-api-key` (reused pattern
   from `discover.mjs`).
2. **`parseUserReelsResponse` / `parseUserReel`** — defensive about the envelope (`reels` | `items` |
   `data.reels`), wrappers (`{media}` / `{node}`), follower-count location, and `taken_at` (unix s/ms vs
   ISO). The pure mapping + work-list build (`buildHandleWorklist`) are unit-tested offline; **only the
   first live paid call confirms the real shape.** If it differs, fix the endpoint/parser here and note
   the working shape below.

> First live verification is a SPEND-GATE item — confirm with Jameson before the call, then record the
> confirmed response shape and any field-alias fixes here.

## Edge cases / learnings
- **No key** — tool errors with the resolver paths + the free chrome fallback. Stop and tell the user.
- **`user/reels` is recent-only** — like the browser grid, it returns recent reels, not a creator's
  all-time top. (Apify's `instagram-scraper` would give true all-time; skipped — no paid Apify account.)
- **Credits** — watch `creditsRemaining` in the output; one call per handle, so a full 27-handle run is
  ~27 credits.

## Wire-in
SKILL.md Step 1.5 (data-source chooser) routes the "paid (fast)" choice here; SKILL.md "Step 2 (paid API)"
documents the run. Free path stays `workflows/scrape-cdp.md`.

## Failure surfacing (2026-07-05)
`fetchUserReels` now backs off between retries and reports the API's own error (e.g. "insufficient
credits") per handle instead of a generic "fetch failed" — an out-of-credits run no longer looks like
"0 new reels". Same for discovery's `searchHashtag` (plus a 1.2s gap between hashtag calls; the search
endpoint 429s under bursts).
