// Library analytics (the Blort-style layer): group what actually performs across the on-niche
// library — format leaderboard, gate-vs-organic lift, duration sweet spots, per-creator scorecards,
// hook stats. Pure + deterministic over the dataset; the agent narrates, this computes.
// Output attaches as ds.analytics and renders as the report's 📊 Analytics tab (and /#insights).
// See workflows/analytics.md.
//
// CLI: node analytics.mjs <dataset.json>   -> prints the analytics JSON (does not write the dataset)
import fs from "node:fs";

const median = (nums) => {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};
const avg = (nums) => (nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0);
const views = (r) => (r.metrics && r.metrics.views) || 0;

// Normalize free-text format tags into comparable buckets ("Talking-head + screen demo" and
// "Talking head + screen-record demo" should group together).
export function normFormat(f) {
  const t = String(f || "").toLowerCase();
  if (!t) return "other";
  const has = (re) => re.test(t);
  const parts = [];
  if (has(/talking[- ]head|piece[- ]to[- ]camera|selfie|confessional|monologue|mirror/)) parts.push("talking-head");
  if (has(/screen|demo|record|tutorial|walkthrough/)) parts.push("screen-demo");
  if (has(/street|interview|man-on-the-street/)) parts.push("interview");
  if (has(/montage|before\/after|before-after|transformation|reveal|backstage/)) parts.push("arc/reveal");
  if (has(/text[- ]on[- ]screen|text overlay/)) parts.push("text-on-screen");
  if (has(/ugc|reaction|skit|comedy/)) parts.push("ugc/reaction");
  if (has(/voiceover|voice-over/)) parts.push("voiceover");
  if (has(/podcast|split-screen/)) parts.push("podcast-clip");
  return parts.length ? parts.join(" + ") : "other";
}

export function buildAnalytics(ds = {}, { now = new Date() } = {}) {
  const on = (ds.reels || []).filter((r) => r.trackingCategory !== "inspiration" && r.offTopic !== true);
  if (!on.length) return { generatedAt: now.toISOString(), onNicheCount: 0, formats: [], cta: null, duration: [], creators: [], hooks: null };

  // Format leaderboard
  const byFmt = new Map();
  for (const r of on) {
    const k = normFormat(r.format);
    if (!byFmt.has(k)) byFmt.set(k, []);
    byFmt.get(k).push(r);
  }
  const formats = [...byFmt.entries()].map(([format, rs]) => ({
    format, count: rs.length,
    medianViews: median(rs.map(views)),
    avgSignal: Math.round(avg(rs.map((r) => r.signalScore || 0))),
    gateShare: +(rs.filter((r) => r.ctaType === "comment-to-DM").length / rs.length).toFixed(2),
  })).sort((a, b) => b.count - a.count || b.medianViews - a.medianViews);

  // Gate vs organic lift
  const gated = on.filter((r) => r.ctaType === "comment-to-DM");
  const organic = on.filter((r) => r.ctaType !== "comment-to-DM");
  const cta = {
    gated: { count: gated.length, medianViews: median(gated.map(views)), medianCommentRate: +avg(gated.map((r) => r.commentRate || 0)).toFixed(4) },
    organic: { count: organic.length, medianViews: median(organic.map(views)), medianCommentRate: +avg(organic.map((r) => r.commentRate || 0)).toFixed(4) },
  };

  // Duration sweet spots
  const buckets = [["<20s", 0, 20], ["20-40s", 20, 40], ["40-60s", 40, 60], ["60s+", 60, Infinity]];
  const duration = buckets.map(([label, lo, hi]) => {
    const rs = on.filter((r) => { const d = r.metrics && r.metrics.durationSec; return Number.isFinite(d) && d >= lo && d < hi; });
    return { bucket: label, count: rs.length, medianViews: median(rs.map(views)) };
  });

  // Per-creator scorecards
  const byCr = new Map();
  for (const r of on) { if (!byCr.has(r.handle)) byCr.set(r.handle, []); byCr.get(r.handle).push(r); }
  const creators = [...byCr.entries()].map(([handle, rs]) => ({
    handle, reels: rs.length,
    medianViews: median(rs.map(views)),
    avgSignal: Math.round(avg(rs.map((r) => r.signalScore || 0))),
    avgBreakout: +avg(rs.map((r) => r.breakout || 0)).toFixed(1),
    bestFormat: normFormat([...rs].sort((a, b) => views(b) - views(a))[0]?.format),
  })).sort((a, b) => b.medianViews - a.medianViews);

  // Hook stats
  const hooks = {
    avgWords: +avg(on.map((r) => String(r.hook || "").trim().split(/\s+/).filter(Boolean).length)).toFixed(1),
    questionShare: +(on.filter((r) => /\?/.test(r.hook || "")).length / on.length).toFixed(2),
    spokenShare: +(on.filter((r) => /spoken/.test(r.hookDelivery || "")).length / on.length).toFixed(2),
  };

  return { generatedAt: now.toISOString(), onNicheCount: on.length, formats, cta, duration, creators, hooks };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const p = process.argv[2];
  if (!p) { console.error("usage: node analytics.mjs <dataset.json>"); process.exit(1); }
  console.log(JSON.stringify(buildAnalytics(JSON.parse(fs.readFileSync(p, "utf8"))), null, 2));
}
