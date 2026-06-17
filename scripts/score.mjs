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
