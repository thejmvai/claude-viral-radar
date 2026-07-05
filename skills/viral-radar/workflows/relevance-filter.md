# Workflow — Reel-level niche relevance (Step 3.75)

**Objective:** keep off-topic viral reels (a tracked creator's gym/lifestyle hit) out of the ranking,
synthesis, digest, Ideator, and analytics — without deleting them.

**Tool:** `scripts/relevance.mjs` — `keywordHits` (word-boundary, multi-word, case-insensitive),
`scoreRelevance` (caption + hook + transcript), `tagRelevance`, `splitOffTopic`. Config:
`nicheKeywords` (list), `nicheMinKeywordHits` (default 2).

**When:** after Step 3 enrichment, before Step 4 ranking. Inspiration-lane reels are never flagged.

**Output:** on-niche reels keep flowing (with `nicheRelevance` evidence attached); `offTopic: true`
reels land in the dataset's `offTopic` array and render in their own report section.

**Edge cases:** no `nicheKeywords` in config → no-op (nothing flagged). Whisper mishears words —
threshold 2 distinct keywords tolerates one bad transcript hit. Tune keywords in the config, not code.
Discovery uses the same keywords: recommended creators need `discoveryMinNicheReels` caption-RELEVANT
reels, which is what keeps off-niche giants out of the picks.
