# Workflow — Report polish (stat-bar + hook frames)

> WAT workflow SOP. Tools: `scripts/render-report.mjs`, `scripts/extract-media.mjs`. Enhancements to the
> report, not a new run path — the agent just runs the normal pipeline; these surface automatically.

## Objective
Two at-a-glance upgrades to the dossier:
1. **Stat-bar** — a row above the tabs summarizing the run: reels · % passed gate · channels · top views ·
   discovered · transcribed. Always rendered (`render-report.mjs` → `statBar`).
2. **0/1/2s hook frames** — the literal first 0, 1, 2 seconds of each reel, captured during enrichment for
   sharper hook study, shown as a small filmstrip in the card's Hook section.

## How it works
- **Stat-bar:** computed purely from the dataset in `render-report.mjs`; no pipeline change. `% passed gate`
  = `reels / (reels + quarantined)`. Top views uses a compact `1M`/`847K` format.
- **Hook frames:** `extract-media.mjs` now also writes `hook-0.jpg` / `hook-1.jpg` / `hook-2.jpg`
  (`hookFrameTimecodes` clamps to clip length) and returns them as `hookFrames`. Step 3 enrichment records
  them on the reel as `hookFrames: ["frames/<shortcode>/hook-*.jpg", ...]`. The card renders the filmstrip
  **only when `hookFrames` is present**, so older datasets render unchanged (backward compatible).

## Done-when
Report shows the stat-bar; hook frames captured by `extract-media` and shown in the card when present.
`render-report.test.mjs` + `extract-media.test.mjs` pass (verified live against the 51-reel dataset:
stat-bar = 51 reels / 93% / 27 channels / 25M / 19 / 51; hook filmstrip hidden on old reels, shown on new).

## Routine post-render check (added 2026-07-05, per Jameson)
Every generated report gets its photos/links verified automatically: `render-report.mjs` runs
`check-report.mjs` after each write — every relative `src`/`href` must resolve on disk next to the
report (data: URIs and external links are counted, not fetched). Broken refs → exit 2 + a list; fix
and re-render before showing the user anything. Root cause this guards against: date-archived reports
live at `reports/<date>/`, two levels below `frames/`, so they must be rendered with
`--frames-base=../../frames/` while `report-latest.html` must NOT be — render each destination, never
copy one to the other. Audit any old report standalone: `node scripts/check-report.mjs <report.html>`.
