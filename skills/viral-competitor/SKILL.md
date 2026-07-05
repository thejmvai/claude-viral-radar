---
name: viral-competitor
description: "Add Instagram competitors to your Viral Radar, then scrape and report on them. Usage: /viral-competitor @name1 @name2"
---

# /viral-competitor — Add Competitors and Run Report

Add one or more Instagram handles to your Viral Radar competitor list, then immediately scrape and build a report for them.

---

## Step 1 — Onboarding check

Check whether `viral-radar-out/.onboarded` exists in the user's current working directory. If it does **not** exist, tell the user:

> "You need to set up Viral Radar first. Run `/viral-radar` to check your browser connection, log in to Instagram once, and pick your niche — then come back here to add competitors."

Then **STOP**.

---

## Step 2 — Parse handles

Parse Instagram handles from the user's message:
- Collect all tokens that start with `@` (e.g. `@creator1`), stripping the leading `@`.
- Also collect bare words that look like handles (alphanumeric + underscores, no spaces) if no `@`-prefixed tokens were found.
- De-duplicate the list.

**Detect the lane.** A handle is either an in-niche **competitor** (default) or an out-of-niche
**inspiration** creator — tracked only for their hook / format / editing, not their topic. Route a handle
to the inspiration lane when the user signals it (e.g. "not in my niche", "for the format / hook / editing",
"steal his style", "different space"). If the user lists several handles with mixed intent, ask which are
inspiration vs competitor before writing. When unsure, default to competitor. See
`../viral-radar/workflows/inspiration-lane.md`.

If no handles were found, ask: "Which Instagram handles would you like to add? (e.g. @creator1 @creator2)"

Wait for the user's reply and then parse handles from it before continuing.

---

## Step 3 — Update config

1. Find the niche config file: look for `viral-radar-out/<niche>.config.json` in the current working directory. If multiple exist, pick the most recently modified (or prompt if ambiguous).
2. Read the config JSON.
3. Append each new handle to the lane chosen in Step 2: **competitor** handles → `trackedHandles`;
   **inspiration** handles → `inspirationHandles` (create the array if the config predates this field).
   De-duplicate against **both** lanes — a handle already present in either should not be added again.
4. Write the updated config back to `viral-radar-out/<niche>.config.json`.

---

## Step 4 — Scrape and report

Run the full scrape and report workflow for the **newly added handles only** (not the entire `trackedHandles` list — this keeps the run fast). Follow the viral-radar detection + enrichment + ranking + synthesis + write-outputs steps exactly:

- **Ask which data source to use (same choice as viral-radar Step 1.5):** *paid* (`scrape-api.mjs`, ScrapeCreators — fast, exact metrics, costs credits, spend-gated) or *free* (`scrape-cdp.mjs`, chrome — slower, IG can throttle). Both accept `--handles=<the new handles>` and write the same work-list shape.
- The shared scripts live in the viral-radar skill install. **Run all commands from the project root** (the directory containing `viral-radar-out/` — outputs are written relative to the CWD), referencing the scripts by their installed path, e.g.:
  - `node ~/.claude/skills/viral-radar/scripts/scrape-api.mjs --niche=<niche> --handles=<h1,h2>` (paid) or `node ~/.claude/skills/viral-radar/scripts/scrape-cdp.mjs --niche=<niche> --handles=<h1,h2>` (free)
  - `node ~/.claude/skills/viral-radar/scripts/extract-media.mjs <reelUrl> viral-radar-out/frames/<shortcode>`
  - `node ~/.claude/skills/viral-radar/scripts/validate.mjs <config> <dataset>`
  - `node ~/.claude/skills/viral-radar/scripts/render-report.mjs <dataset> <out.html>`
  (In this project the local install lives at `.claude/skills/viral-radar/scripts/` — same layout.)
- Use the config loaded in Step 3 for thresholds (`viralThreshold`, `velocityThreshold`, etc.).
- Both scrapers read both lanes from the config and stamp `trackingCategory: "inspiration"` on reels from an inspiration handle. Passing `--handles=<the new handle>` still tags it correctly (the tag comes from config membership, not the flag).
- Append newly discovered reels to the existing dataset at `viral-radar-out/<niche>.json` (merge, do not overwrite the full dataset unless re-generating from scratch).
- Update `viral-radar-out/cache/<niche>-seen.json` with newly processed shortcodes.
- Re-run synthesis over the merged dataset's gate-passing reels, **excluding** any with `trackingCategory === "inspiration"` (out-of-niche style references must not skew the niche synthesis — see `../viral-radar/workflows/inspiration-lane.md`).
- Validate with `validate.mjs` before writing.
- Render the report into the date-stamped archive folder, then update the latest pointer (from the project root):
  ```
  mkdir -p viral-radar-out/reports/<YYYY-MM-DD>
  node ~/.claude/skills/viral-radar/scripts/render-report.mjs viral-radar-out/<niche>.json viral-radar-out/reports/<YYYY-MM-DD>/report.html
  cp viral-radar-out/<niche>.json viral-radar-out/reports/<YYYY-MM-DD>/<niche>.json
  ```
  Then copy the rendered report to `viral-radar-out/report-latest.html`.

---

## Step 5 — Confirm

Tell the user which handles were added, to which lane, and where the report is:

> "Added: @handle1 (competitor), @handle2 (inspiration). Report refreshed at `viral-radar-out/report-latest.html` — open it in Chrome or print to PDF. Inspiration creators are badged `INSPIRATION · FORMAT` and kept out of the niche synthesis."
