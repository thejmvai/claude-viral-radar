# Workflow — Inspiration lane (out-of-niche format references)

**Objective:** track a creator who is *outside* your niche purely for their hook / format / editing
craft, surface their viral reels in the dossier so you can adapt the structure into your own niche, and
keep their **topics** from polluting the niche's trend synthesis (and the downstream Ideator).

## When to use
A creator whose *style* you want to steal but whose *subject* is irrelevant to your niche. (In-niche
competitors go in the normal `trackedHandles` lane instead.)

## Inputs
- `viral-radar-out/<niche>.config.json` — the niche config.
- One or more out-of-niche Instagram handles.

## The mechanism (how the lane works end to end)
1. **Config:** the handle lives in `config.inspirationHandles` (a flat array of strings, parallel to
   `trackedHandles`). Both are optional; absent = empty lane.
2. **Scrape** (`scripts/scrape-cdp.mjs`): `resolveScrapeList(cfg, explicit)` merges
   `trackedHandles + inspirationHandles` (de-duped, normalized). Any handle that is a member of
   `inspirationHandles` is scraped with `trackingCategory: "inspiration"`, which `buildWorklistItem`
   stamps onto each of that handle's work-list reels. Membership drives the tag, so an explicit
   `--handles=<handle>` run (the `/viral-competitor` "newly added only" path) still tags correctly.
   A handle in both lanes resolves to `inspiration`.
3. **Discovery** (`scripts/discover.mjs`): inspiration handles are added to the discovery `exclude` set —
   we never want to surface an out-of-niche creator as a niche "discovery".
4. **Synthesis** (SKILL.md Step 5): synthesize over
   `reels.filter((r) => r.trackingCategory !== "inspiration")` **only**. Inspiration reels stay in
   `reels` but are not a source of `nicheSynthesis` / `whatsWorking` / `topPatterns`.
5. **Report** (`scripts/render-report.mjs`): inspiration reels render in their **own "✨ Inspiration" tab**
   (renumbered 1..N, with a note), kept **out of the main "Instagram Reels" ranking and the stat-bar** —
   a true off-niche column, not mixed into the niche ranking. They still carry the `INSPIRATION · FORMAT`
   badge (`.pill-inspo`, violet). (Updated 2026-06-20 — Jameson wanted an off-niche *column*, not just a
   badge in the main list; e.g. a comedy account's 11.7M-view reel must not top the AI ranking.)
6. **Digest** (`scripts/notify-telegram.mjs`): inspiration reels are excluded from the Telegram digest's
   top-N and per-channel coverage (it's a niche digest).
7. **Validation** (`scripts/validate.mjs`): `inspirationHandles`, if present, must be an array; a reel's
   `trackingCategory`, if present, must be a known value (`"inspiration"`). Both are optional, so old
   datasets/configs validate unchanged.

## Steps (adding one)
1. Add the handle (no `@`, lowercase) to `config.inspirationHandles`, de-duping against both lanes.
2. Scrape just the new handle (free, local Chrome): `node scripts/scrape-cdp.mjs --niche=<niche> --handles=<handle>`.
   (Chrome must be on `:9222`, logged into Instagram — see `workflows/scrape-cdp.md`. IG throttles fresh
   reel-grid bursts; pace with `--gap` and re-run if a handle comes back header-only.)
3. Enrich the new work-list reels (Step 3), **merge** into `viral-radar-out/<niche>.json`.
4. Re-run synthesis over the merged dataset **excluding** `trackingCategory === "inspiration"` reels.
5. Validate, then render (Step 6). Confirm the new reels show the `INSPIRATION · FORMAT` badge and that
   `nicheSynthesis` did not pick up their topics.

## Expected output
The dossier shows the out-of-niche creator's viral reels (hook frames, storyboard, breakdown, transcript)
badged as inspiration; the niche's "Top replicable plays" / trend synthesis are unchanged by them.

## Edge cases
- **Handle in both lanes** → treated as inspiration (config membership wins).
- **Audience-size mismatch:** the viral gate uses the niche's `viralThreshold` / `velocityThreshold`.
  A much larger out-of-niche creator may clear the gate easily; that's fine — the point is to see what
  *worked* for them. If a creator's whole grid clears trivially and floods the report, consider a
  separate `inspiration` niche/config instead.
- **Removing a creator:** delete from `inspirationHandles`; existing reels remain in the dataset until the
  next from-scratch rebuild (or prune them manually).
