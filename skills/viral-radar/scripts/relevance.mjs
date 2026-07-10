// Reel-level niche relevance: a tracked creator's VIRAL reel is not automatically an ON-NICHE reel
// (a motivational creator's gym reel going viral tells the AI radar nothing). Deterministic keyword
// scoring over the text we already have (caption + hook + transcript): word-boundary matches against
// config.nicheKeywords, distinct-keyword hit count, off-topic below config.nicheMinKeywordHits.
// STRONG TIER: one hit on any config.nicheStrongKeywords keyword (names that alone prove the niche,
// e.g. "claude", "anthropic") marks the reel on-niche regardless of the distinct-hit count — fixes the
// false negative where a reel says "Claude" ten times but that counts as ONE distinct keyword and the
// min-2 rule throws it out (live miss: the Composio-for-Claude reel, 2026-07-10).
// Off-topic reels are kept (ds.offTopic) but leave the ranking, synthesis, digest, and Ideator.
// Also powers discovery: a recommended creator must have >= discoveryMinNicheReels RELEVANT reels,
// not merely search-matched ones — that is what keeps off-niche giants out of the picks.
// See workflows/relevance-filter.md.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Distinct keywords (case-insensitive, word-boundary, multi-word supported) found in `text`.
export function keywordHits(text, keywords = []) {
  const t = String(text || "").toLowerCase();
  if (!t) return [];
  const hits = [];
  for (const kw of keywords) {
    const k = String(kw || "").trim().toLowerCase();
    if (!k) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(k)}($|[^a-z0-9])`, "i");
    if (re.test(t)) hits.push(k);
  }
  return [...new Set(hits)];
}

// Relevance for one reel: which niche keywords its caption/hook/transcript actually contain.
export function scoreRelevance(reel = {}, keywords = []) {
  const text = [reel.caption, reel.hook, reel.transcript].filter(Boolean).join("\n");
  const matched = keywordHits(text, keywords);
  return { hits: matched.length, matched };
}

// Tag every reel. Inspiration-lane reels are expected off-niche (tracked for craft) — never flagged.
// A single nicheStrongKeywords hit is on-niche outright; otherwise nicheMinKeywordHits distinct
// nicheKeywords are required. Returns new objects; does not mutate.
export function tagRelevance(reels = [], cfg = {}) {
  const keywords = cfg.nicheKeywords || [];
  const strong = cfg.nicheStrongKeywords || [];
  const min = Number(cfg.nicheMinKeywordHits ?? 2);
  if (!keywords.length && !strong.length) return reels.map((r) => ({ ...r })); // nothing configured -> no-op
  return reels.map((r) => {
    if (r.trackingCategory === "inspiration") return { ...r };
    const { hits, matched } = scoreRelevance(r, keywords);
    const strongMatched = strong.length ? scoreRelevance(r, strong).matched : [];
    return {
      ...r,
      nicheRelevance: { hits, matched, strongMatched },
      offTopic: hits < min && strongMatched.length === 0,
    };
  });
}

// Split a tagged list into { onNiche, offTopic } (inspiration reels ride with onNiche — the report
// lanes them separately already).
export function splitOffTopic(reels = []) {
  const offTopic = reels.filter((r) => r.offTopic === true);
  const onNiche = reels.filter((r) => r.offTopic !== true);
  return { onNiche, offTopic };
}
