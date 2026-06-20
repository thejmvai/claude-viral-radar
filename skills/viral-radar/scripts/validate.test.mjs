import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDataset, validateConfig } from "./validate.mjs";

const reel = {
  rank: 1, shortcode: "DW", url: "https://www.instagram.com/reel/DW/",
  handle: "@x", creatorName: "X", followers: 80000, discoveredVia: "tracked",
  postedAt: "2026-03-18", ageHoursAtCatch: 1200, viralReason: "absolute",
  metrics: { views: 1000000, likes: 26000, comments: 41000, durationSec: 67 },
  likeRate: 0.026, commentRate: 0.041, ctaType: "comment-to-DM",
  breakout: 9, creatorMedianViews: 111000, reachMultiple: 12.4,
  signalScore: 87, qualityFlag: "ok", hook: "h", hookDelivery: "spoken+text",
  format: "Talking-head", breakdown: "b", whyItWorks: "w", transcript: "t",
  storyboard: [{ timestamp: "0:03", role: "Hook", caption: "c", frame: "reports/frames/DW/1.jpg" }],
  enrichedAt: "2026-06-17T05:14:00", enrichmentEngine: "local",
};

test("valid dataset passes", () => {
  const ds = { niche: "ai-claude", generatedAt: "2026-06-17T05:10:00",
    nicheSynthesis: { whatsWorking: ["x"], topPatterns: [{ pattern: "p", count: 1 }], summary: "s" },
    reels: [reel], quarantined: [] };
  assert.deepEqual(validateDataset(ds), []);
});

test("missing reel field is reported", () => {
  const bad = { niche: "n", generatedAt: "t", nicheSynthesis: { whatsWorking: [], topPatterns: [], summary: "" },
    reels: [{ ...reel, hook: undefined }], quarantined: [] };
  const errs = validateDataset(bad);
  assert.ok(errs.some((e) => e.includes("hook")));
});

test("config validation catches missing threshold", () => {
  const errs = validateConfig({ niche: "n", label: "N" });
  assert.ok(errs.some((e) => e.includes("viralThreshold")));
});

test("inspirationHandles is optional but must be an array when present", () => {
  const full = { niche: "ai-claude", label: "AI / Claude", viralThreshold: 100000, velocityThreshold: 50000,
    velocityWindowHours: 48, qualityGateLikeRate: 0.005, seedHashtags: [], trackedHandles: [],
    discoveryEnabled: true, discoveryMinViews: 50000, scrapeTargetPerHandle: 36, minPerHandle: 5,
    enrichmentCapPerRun: 60, recencyWeight: 0.35, recencyHalfLifeDays: 30, updatedAt: "2026-06-20" };
  assert.deepEqual(validateConfig(full), []);                                  // absent -> fine
  assert.deepEqual(validateConfig({ ...full, inspirationHandles: ["@x"] }), []); // array -> fine
  assert.ok(validateConfig({ ...full, inspirationHandles: "@x" })              // string -> error
    .some((e) => e.includes("inspirationHandles must be an array")));
});

test("reel trackingCategory is optional; a bad value is reported, a good one passes", () => {
  const ds = { niche: "n", generatedAt: "t", nicheSynthesis: { whatsWorking: [], topPatterns: [], summary: "" },
    reels: [{ ...reel, trackingCategory: "inspiration" }], quarantined: [] };
  assert.deepEqual(validateDataset(ds), []);
  const bad = { ...ds, reels: [{ ...reel, trackingCategory: "bogus" }] };
  assert.ok(validateDataset(bad).some((e) => e.includes("invalid trackingCategory")));
});
