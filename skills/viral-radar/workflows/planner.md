# Workflow — Planner (ideas → content calendar)

> WAT workflow SOP. Tool: `scripts/planner.mjs` (deterministic scheduling). Agent: optionally sequence the
> ideas for arc before scheduling. Feeds off the Ideator's reviewed ideas.

## Objective
Turn the Ideator's approved ideas (`ideas-<niche>.json`) into a **dated content calendar** — each idea
assigned a posting slot on a sustainable cadence. Output `plan-<niche>.json`.

## Inputs
- `viral-radar-out/ideas-<niche>.json` — the reviewed ideas (`{ niche, generatedAt, ideas: [...] }`).
- Cadence: which weekdays to post (default **Mon/Wed/Fri** = 3/week) and a `startDate` (default: today).
  Override per run with `--days=Mon,Wed,Fri` and `--start=YYYY-MM-DD`.

## Steps
1. **(Optional) sequence for arc (agent):** reorder the ideas array so the feed has variety — the voice
   data shows short personal / build-in-public posts out-engage the structured teaching series ~8:1, so
   interleave a personal/build-in-public idea between teaching ones rather than batching all teaching first.
2. **Schedule (tool):** `buildPlan(ideas, { startDate, daysOfWeek })` from `scripts/planner.mjs` assigns each
   idea, in order, to the next posting slot (`scheduleDates` walks forward from `startDate` picking the
   chosen weekdays). Returns `{ startDate, daysOfWeek, count, schedule: [{ slot, date, day, hook, format,
   angle, grounding }] }`.
3. **Validate (tool):** `validatePlan(plan)` — every slot needs a date + hook. Fix and re-validate.
4. **Save + present:** write `viral-radar-out/plan-<niche>.json` and show Jameson the calendar
   (date · day · hook · format). It's a posting schedule, not a publish action — nothing is posted.

## Done-when
A dated calendar at `plan-<niche>.json` covering all reviewed ideas on the chosen cadence, passing
`validatePlan`, presented to Jameson. `planner.test.mjs` passes.

## Notes
- **Deterministic dates:** `scheduleDates(startDate, daysOfWeek, count)` is pure (no "now" inside) so the
  calendar is reproducible — pass `startDate` explicitly.
- The Planner schedules; it never posts. Publishing stays a manual, reviewed step (voice rule).
- One idea per slot, in array order — so do the arc sequencing (step 1) before scheduling if you want it.
