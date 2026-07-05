const REEL_FIELDS = ["rank","shortcode","url","handle","creatorName","followers","discoveredVia","postedAt","ageHoursAtCatch","viralReason","metrics","likeRate","commentRate","ctaType","breakout","creatorMedianViews","reachMultiple","signalScore","qualityFlag","hook","hookDelivery","format","breakdown","whyItWorks","transcript","storyboard","enrichedAt","enrichmentEngine"];
const METRIC_FIELDS = ["views","likes","comments","durationSec"];
const CONFIG_FIELDS = ["niche","label","viralThreshold","velocityThreshold","velocityWindowHours","qualityGateLikeRate","seedHashtags","trackedHandles","discoveryEnabled","discoveryMinViews","scrapeTargetPerHandle","minPerHandle","enrichmentCapPerRun","recencyWeight","recencyHalfLifeDays","updatedAt"];
// Optional reel field: out-of-niche handles get tagged so the report can badge them and synthesis can skip them.
const TRACKING_CATEGORIES = ["inspiration"];

export function validateConfig(cfg) {
  const errs = [];
  if (!cfg || typeof cfg !== "object") return ["config is not an object"];
  for (const f of CONFIG_FIELDS) if (cfg[f] === undefined) errs.push(`config missing ${f}`);
  // inspirationHandles is optional; if present it must be an array of handle strings.
  if (cfg.inspirationHandles !== undefined && !Array.isArray(cfg.inspirationHandles))
    errs.push("config inspirationHandles must be an array");
  return errs;
}

function validateReel(r, where, { requireRank = true } = {}) {
  const errs = [];
  for (const f of REEL_FIELDS) {
    if (f === "rank" && !requireRank) continue;
    if (r[f] === undefined) errs.push(`${where} missing ${f}`);
  }
  if (r.metrics) for (const f of METRIC_FIELDS) if (r.metrics[f] === undefined) errs.push(`${where}.metrics missing ${f}`);
  if (!Array.isArray(r.storyboard)) errs.push(`${where}.storyboard not an array`);
  // trackingCategory is optional; if present it must be a known value.
  if (r.trackingCategory !== undefined && !TRACKING_CATEGORIES.includes(r.trackingCategory))
    errs.push(`${where} has invalid trackingCategory "${r.trackingCategory}"`);
  return errs;
}

export function validateDataset(ds) {
  const errs = [];
  if (!ds || typeof ds !== "object") return ["dataset is not an object"];
  for (const f of ["niche","generatedAt","nicheSynthesis","reels","quarantined"])
    if (ds[f] === undefined) errs.push(`dataset missing ${f}`);
  (ds.reels || []).forEach((r, i) => errs.push(...validateReel(r, `reels[${i}]`)));
  // Quarantined reels are excluded from ranking (rankReels never touches them), so rank is optional there.
  (ds.quarantined || []).forEach((r, i) => errs.push(...validateReel(r, `quarantined[${i}]`, { requireRank: false })));
  return errs;
}

// CLI: node validate.mjs <config.json> <dataset.json>
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const fs = await import("node:fs");
  const [cfgPath, dsPath] = process.argv.slice(2);
  let errs = [];
  if (cfgPath) errs.push(...validateConfig(JSON.parse(fs.readFileSync(cfgPath, "utf8"))));
  if (dsPath) errs.push(...validateDataset(JSON.parse(fs.readFileSync(dsPath, "utf8"))));
  if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
  console.log("OK");
}
