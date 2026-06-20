# Workflow — Ideator (radar insight → reel ideas in his voice)

> WAT workflow SOP. Tool: `scripts/ideator.mjs` (deterministic grounding + validation). Agent: reads
> `voice.md`, writes the ideas. **GATE: ideas are his-voice content — produce a DRAFT for Jameson's review,
> never auto-publish.**

## Objective
Close the loop from *what's working* → *what should I make.* Read the radar dataset (top on-niche reels +
detected patterns) and the cross-platform trends, and produce **5–10 ranked reel ideas** strictly in
Jameson's voice — each a hook (≤12 words) + angle + format, **grounded in a real radar/trend item** so it's
never made up.

## Inputs
- `viral-radar-out/<niche>.json` — the dataset (`reels`, `nicheSynthesis.{whatsWorking,topPatterns}`,
  optional `crossPlatform`).
- `viral-radar-out/trends-<niche>.json` (optional) — cross-platform trends, if not already on the dataset.
- **Voice (read-only, absolute path):** `/Users/jamesonchua/Claude/AIOS/references/voice.md`. Obey it:
  plain words/SIMPLICITY, solopreneur audience, his openers + devices, **no em dashes**, no fabricated scale.

## Steps
1. **Build the grounding pack (tool):** `buildIdeaContext(dataset, { topN })` from `scripts/ideator.mjs` →
   `{ topReels, patterns, whatsWorking, trends }` (on-niche only; inspiration reels excluded). This is the
   evidence each idea must cite — do not invent beyond it.
2. **Generate ideas (agent):** read `voice.md`, then write 5–10 ideas. Each idea:
   - `hook` — ≤ 12 words, in his voice (a real opener: "Did you know…", "Hot take,", a scene drop). Open a
     loop, don't close it.
   - `angle` — 1–2 sentences: the spiky reframe / named analogy / payoff for a solopreneur.
   - `format` — a concrete format tag (e.g. "Talking-head + on-screen text", "build-in-public confession").
   - `grounding` — `{ type: "reel"|"trend"|"pattern", ref, note }` tying it to a real radar item.
3. **Validate (tool):** `validateIdeas(ideas)` — every idea needs a ≤12-word hook, angle, format, and a
   grounding ref. Fix and re-validate until clean.
4. **Save:** write `viral-radar-out/ideas-<niche>.json` = `{ niche, generatedAt, ideas }`. Optionally attach
   `ds.ideas` and re-render so the report shows an **"Ideas" tab**.
5. **GATE — review:** present the ideas as a draft for Jameson. Do **not** post, schedule, or push them
   anywhere until he approves. (Voice rule: external/his-voice content always gets a draft first.)

## Done-when
Concrete, on-voice, radar-grounded ideas saved to `ideas-<niche>.json`, each citing a real reel/trend/
pattern, passing `validateIdeas`, reviewed by Jameson before any publish. `ideator.test.mjs` passes.

## Notes
- **Ground everything.** An idea with no `grounding.ref` is a hallucination — `validateIdeas` rejects it.
- **No fabricated scale.** He's early (~50 followers); ideas must read true to an early solopreneur.
- Inspiration-lane reels are format references, not niche signal — `buildIdeaContext` excludes them from
  `topReels` but their *format* can inform an idea's `format` (cite as `type:"reel"` with a note).
