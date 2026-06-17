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

If no handles were found, ask: "Which Instagram handles would you like to add? (e.g. @creator1 @creator2)"

Wait for the user's reply and then parse handles from it before continuing.

---

## Step 3 — Update config

1. Find the niche config file: look for `viral-radar-out/<niche>.config.json` in the current working directory. If multiple exist, pick the most recently modified (or prompt if ambiguous).
2. Read the config JSON.
3. Append the new handles to `trackedHandles`, de-duplicating against what is already there. A handle already present should not be added twice.
4. Write the updated config back to `viral-radar-out/<niche>.config.json`.

---

## Step 4 — Scrape and report

Run the full scrape and report workflow for the **newly added handles only** (not the entire `trackedHandles` list — this keeps the run fast). Follow the viral-radar detection + enrichment + ranking + synthesis + write-outputs steps exactly:

- The shared scripts live at `../viral-radar/scripts/` relative to this SKILL.md once both skills are installed under `~/.claude/skills/` — for example:
  - `node ../viral-radar/scripts/score.mjs`
  - `node ../viral-radar/scripts/validate.mjs`
  - `node ../viral-radar/scripts/render-report.mjs`
  - `node ../viral-radar/scripts/parse-og.mjs`
  - `node ../viral-radar/scripts/extract-media.mjs`
- Use the config loaded in Step 3 for thresholds (`viralThreshold`, `velocityThreshold`, etc.).
- Append newly discovered reels to the existing dataset at `viral-radar-out/<niche>.json` (merge, do not overwrite the full dataset unless re-generating from scratch).
- Update `viral-radar-out/cache/<niche>-seen.json` with newly processed shortcodes.
- Re-run synthesis over all gate-passing reels in the merged dataset.
- Validate with `../viral-radar/scripts/validate.mjs` before writing.
- Render and copy the report using `../viral-radar/scripts/render-report.mjs`:
  ```
  node ../viral-radar/scripts/render-report.mjs viral-radar-out/<niche>.json viral-radar-out/report-<YYYY-MM-DD>.html
  ```
  Then copy to `viral-radar-out/report-latest.html`.

---

## Step 5 — Confirm

Tell the user which handles were added and where the report is:

> "Added: @handle1, @handle2. Report refreshed at `viral-radar-out/report-latest.html` — open it in Chrome or print to PDF."
