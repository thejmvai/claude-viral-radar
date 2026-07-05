# Workflow — Library analytics (Step 5.5)

**Objective:** replace hand-waved analysis with deterministic benchmarks (the Blort-style layer:
format performance grouping, viral-library benchmarking).

**Tool:** `scripts/analytics.mjs` — `normFormat` (free-text format tags → comparable buckets),
`buildAnalytics(ds)` → format leaderboard, gate-vs-organic lift, duration sweet spots, per-creator
scorecards, hook stats. On-niche only (inspiration + off-topic excluded).

**When:** after Step 5 synthesis, before Step 6 writes. Attach output as `ds.analytics`; the report
renders the 📊 Analytics tab from it and /#insights (vault-graph) reads the same block.

**Rule for the agent:** narrate FROM these numbers (top formats, lift, sweet spots); never hand-count
patterns the tool already computes. The synthesis prose cites them; the tool owns the arithmetic.
