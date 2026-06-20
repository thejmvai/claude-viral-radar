# Workflow — Off-niche reference bucket

> WAT workflow SOP. Tool: `splitOffNiche` in `scripts/score.mjs` + `render-report.mjs` + `validate.mjs`.

## Objective
Keep tracking accounts that go viral but are **off-niche** (e.g. a comedy account in an AI radar) as
"viral mechanics" references, without letting them crowd out the niche signal. They're scraped + enriched
like any handle, but bucketed separately: out of the main ranking, synthesis, and Telegram digest, shown
in their own "Off-niche" report tab.

## How it works
- **Config:** add the handles to `offNicheHandles: ["alfie_dundas", ...]` in `<niche>.config.json`
  (optional; omit/empty = everything on-niche). They stay in `trackedHandles` too (still scraped).
- **Split (Step 4):** `splitOffNiche(reels, config.offNicheHandles)` → `{ onNiche, offNiche }` by handle
  (normalized). `reels` = onNiche (ranked, synthesized, digested); `offNiche` = the references (ranked in
  their own bucket). `quarantined` (boosted) is unchanged.
- **Dataset:** `{ ..., reels, quarantined, offNiche }`. `offNiche` is optional; `validate.mjs` checks it
  like a reel array when present.
- **Report:** `render-report.mjs` adds an "Off-niche" tab (with a note) when `ds.offNiche` is non-empty;
  the stat-bar + main tab count on-niche `reels` only.
- **Digest:** `notify-telegram.mjs` reads `ds.reels`, so off-niche reels are auto-excluded from the top-N.

## Done-when
Off-niche handles' reels appear in their own tab, never in the main ranking/digest. `score.test.mjs`,
`render-report.test.mjs`, `validate.test.mjs` pass. (Origin: 2026-06-20 — `@alfie_dundas` comedy reels,
incl. an 11.7M-view outlier, were ranking #1/#4 on the AI radar; Jameson chose "off-niche column.")
