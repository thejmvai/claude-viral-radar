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
