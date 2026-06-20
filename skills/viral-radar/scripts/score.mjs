const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const likeRate = (likes, views) => (views > 0 ? likes / views : 0);
export const commentRate = (comments, views) => (views > 0 ? comments / views : 0);
export const breakout = (views, medianViews) => (medianViews > 0 ? views / medianViews : 0);
export const reachMultiple = (views, followers) => (followers > 0 ? views / followers : 0);

export const qualityFlag = (lr) => (lr < 0.005 ? "boosted" : "ok");

export function isViral(reel, cfg) {
  if (reel.views >= cfg.viralThreshold) return true;
  return reel.ageHours < cfg.velocityWindowHours && reel.views >= cfg.velocityThreshold;
}

// 1.0 for small accounts, decaying to 0.25 for very large ones (log-space).
export function replicability(followers) {
  if (followers <= 200000) return 1;
  if (followers >= 5000000) return 0.25;
  const t =
    (Math.log10(followers) - Math.log10(200000)) /
    (Math.log10(5000000) - Math.log10(200000));
  return 1 - 0.75 * t;
}

// 0-100 composite used to rank reels. Gate-passing reels only.
export function signalScore({ likeRate: lr, commentRate: cr, ctaType, breakout: bo, followers }) {
  const engagement = clamp(lr / 0.04, 0, 1); // 4% like-rate = full marks
  const organicComment = clamp((ctaType === "organic" ? cr : 0) / 0.03, 0, 1);
  const breakoutScore = clamp(Math.log10(Math.max(bo, 1)) / Math.log10(50), 0, 1); // 50x = full
  const replic = replicability(followers);
  const raw = 0.42 * engagement + 0.18 * organicComment + 0.25 * breakoutScore + 0.15 * replic;
  return Math.round(100 * raw);
}

// Age in hours from an ISO/`YYYY-MM-DD` postedAt to `now` (Date | ms | ISO). Negative ages clamp to 0.
export function ageHoursFrom(postedAt, now = new Date()) {
  if (!postedAt) return Infinity;
  const t = new Date(postedAt).getTime();
  const n = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, (n - t) / 3.6e6);
}

// 0..1 freshness from an exponential half-life decay. A post `halfLifeDays` old scores 0.5.
export function recencyScore(postedAt, now = new Date(), halfLifeDays = 30) {
  const ageDays = ageHoursFrom(postedAt, now) / 24;
  if (!Number.isFinite(ageDays)) return 0;
  return Math.pow(0.5, ageDays / Math.max(1, halfLifeDays));
}

// 0-100 ranking score blending signal (quality) with recency (time of post).
// recencyWeight = share of the score driven by freshness (0 = pure signal, 1 = pure recency).
export function rankScore({ signalScore: ss, postedAt, now = new Date(), recencyWeight = 0.35, halfLifeDays = 30 }) {
  const w = clamp(recencyWeight, 0, 1);
  const rec = recencyScore(postedAt, now, halfLifeDays);
  return Math.round((1 - w) * ss + w * 100 * rec);
}

const normH = (h) => String(h || "").trim().replace(/^@/, "").toLowerCase();

// Split reels into on-niche vs off-niche by handle. Off-niche handles are tracked + enriched as
// "viral mechanics" references (e.g. a comedy account that goes huge) but kept OUT of the main
// ranking/digest so they don't crowd out the niche signal. `offNicheHandles` from the config.
export function splitOffNiche(reels, offNicheHandles = []) {
  const off = new Set((offNicheHandles || []).map(normH));
  const onNiche = [], offNiche = [];
  for (const r of reels || []) (off.has(normH(r.handle)) ? offNiche : onNiche).push(r);
  return { onNiche, offNiche };
}

// Rank a list of gate-passing reels by rankScore (desc); ties break to the newer post.
// Mutates+returns each reel with { recencyScore, rankScore, rank }. `now` defaults to current time.
export function rankReels(reels, { now = new Date(), recencyWeight = 0.35, halfLifeDays = 30 } = {}) {
  const scored = reels.map((r) => {
    const rec = recencyScore(r.postedAt, now, halfLifeDays);
    return {
      ...r,
      recencyScore: +rec.toFixed(4),
      rankScore: rankScore({ signalScore: r.signalScore, postedAt: r.postedAt, now, recencyWeight, halfLifeDays }),
    };
  });
  scored.sort((a, b) => b.rankScore - a.rankScore || new Date(b.postedAt) - new Date(a.postedAt));
  scored.forEach((r, i) => (r.rank = i + 1));
  return scored;
}
