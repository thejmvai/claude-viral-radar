# Workflow — Reel-level niche relevance (Step 3.75)

**Objective:** keep off-topic viral reels (a tracked creator's gym/lifestyle hit) out of the ranking,
synthesis, digest, Ideator, and analytics — without deleting them.

**Tool:** `scripts/relevance.mjs` — `keywordHits` (word-boundary, multi-word, case-insensitive),
`scoreRelevance` (caption + hook + transcript), `tagRelevance`, `splitOffTopic`. Config:
`nicheKeywords` (list), `nicheMinKeywordHits` (default 2), `nicheStrongKeywords` (list, optional).

**Strong tier:** one hit on any `nicheStrongKeywords` entry marks the reel on-niche outright, no
distinct-hit minimum. Use it for names that alone prove the niche (for `ai-claude`: "claude",
"anthropic", "chatgpt"…). Why it exists: distinct-hit counting collapses repeats — a reel that says
"Claude" ten times scores ONE distinct keyword and the min-2 rule threw it out (live miss 2026-07-10:
a Composio-for-Claude connectors reel, dead-center on-niche, landed in `offTopic` while three
near-identical tool reels passed). Keep the strong list tight — a too-generic strong keyword (e.g.
bare "ai") would wave nearly everything through and neuter the filter.

**When:** after Step 3 enrichment, before Step 4 ranking. Inspiration-lane reels are never flagged.

**Output:** on-niche reels keep flowing (with `nicheRelevance` evidence attached); `offTopic: true`
reels land in the dataset's `offTopic` array and render in their own report section.

**Edge cases:** neither `nicheKeywords` nor `nicheStrongKeywords` in config → no-op (nothing flagged).
Whisper mishears words — threshold 2 distinct keywords tolerates one bad transcript hit (and Whisper
hears "Claude" as "Cloud": correct transcripts before tagging when the reel is clearly about Claude).
Tune keywords in the config, not code.
Discovery uses the same keywords: recommended creators need `discoveryMinNicheReels` caption-RELEVANT
reels, which is what keeps off-niche giants out of the picks.
