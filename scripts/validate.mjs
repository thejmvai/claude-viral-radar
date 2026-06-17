const REEL_FIELDS = ["rank","shortcode","url","handle","creatorName","followers","discoveredVia","postedAt","ageHoursAtCatch","viralReason","metrics","likeRate","commentRate","ctaType","breakout","creatorMedianViews","reachMultiple","signalScore","qualityFlag","hook","hookDelivery","format","breakdown","whyItWorks","transcript","storyboard","enrichedAt","enrichmentEngine"];
const METRIC_FIELDS = ["views","likes","comments","durationSec"];
const CONFIG_FIELDS = ["niche","label","viralThreshold","velocityThreshold","velocityWindowHours","qualityGateLikeRate","seedHashtags","trackedHandles","discoveryEnabled","enrichmentCapPerRun","updatedAt"];

export function validateConfig(cfg) {
  const errs = [];
  if (!cfg || typeof cfg !== "object") return ["config is not an object"];
  for (const f of CONFIG_FIELDS) if (cfg[f] === undefined) errs.push(`config missing ${f}`);
  return errs;
}

function validateReel(r, where) {
  const errs = [];
  for (const f of REEL_FIELDS) if (r[f] === undefined) errs.push(`${where} missing ${f}`);
  if (r.metrics) for (const f of METRIC_FIELDS) if (r.metrics[f] === undefined) errs.push(`${where}.metrics missing ${f}`);
  if (!Array.isArray(r.storyboard)) errs.push(`${where}.storyboard not an array`);
  return errs;
}

export function validateDataset(ds) {
  const errs = [];
  if (!ds || typeof ds !== "object") return ["dataset is not an object"];
  for (const f of ["niche","generatedAt","nicheSynthesis","reels","quarantined"])
    if (ds[f] === undefined) errs.push(`dataset missing ${f}`);
  (ds.reels || []).forEach((r, i) => errs.push(...validateReel(r, `reels[${i}]`)));
  (ds.quarantined || []).forEach((r, i) => errs.push(...validateReel(r, `quarantined[${i}]`)));
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
