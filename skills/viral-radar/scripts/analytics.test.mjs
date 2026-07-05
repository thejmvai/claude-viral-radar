import { test } from "node:test";
import assert from "node:assert/strict";
import { normFormat, buildAnalytics } from "./analytics.mjs";

test("normFormat groups free-text tags into comparable buckets", () => {
  assert.equal(normFormat("Talking-head + screen demo"), "talking-head + screen-demo");
  assert.equal(normFormat("Talking head hook + screen-record demo"), "talking-head + screen-demo");
  assert.equal(normFormat("Selfie-cam street interview"), "talking-head + interview");
  assert.equal(normFormat("Backstage hype + stage reveal"), "arc/reveal");
  assert.equal(normFormat(""), "other");
});

const mk = (over) => ({
  handle: "@a", format: "Talking-head + screen demo", ctaType: "organic", signalScore: 50,
  hook: "How I automated my whole business", hookDelivery: "spoken",
  metrics: { views: 100000, durationSec: 30 }, commentRate: 0.01, breakout: 2, ...over,
});

test("buildAnalytics computes formats, cta lift, duration buckets, creators, hooks", () => {
  const ds = { reels: [
    mk({}),
    mk({ handle: "@b", ctaType: "comment-to-DM", metrics: { views: 400000, durationSec: 55 } }),
    mk({ handle: "@a", format: "UGC reaction", metrics: { views: 900000, durationSec: 15 }, hook: "Is this real?" }),
    mk({ handle: "@c", trackingCategory: "inspiration" }),   // excluded
    mk({ handle: "@d", offTopic: true }),                     // excluded
  ] };
  const a = buildAnalytics(ds, { now: new Date("2026-07-05T00:00:00Z") });
  assert.equal(a.onNicheCount, 3);
  assert.equal(a.formats[0].format, "talking-head + screen-demo");
  assert.equal(a.formats[0].count, 2);
  assert.equal(a.cta.gated.count, 1);
  assert.equal(a.cta.organic.count, 2);
  assert.equal(a.duration.find((d) => d.bucket === "<20s").count, 1);
  assert.equal(a.creators[0].handle, "@a"); // median 500000 > @b 400000
  assert.equal(a.creators[0].reels, 2);
  assert.ok(a.hooks.avgWords > 0);
  assert.equal(a.hooks.questionShare, +(1 / 3).toFixed(2));
});

test("buildAnalytics handles an empty library", () => {
  const a = buildAnalytics({ reels: [] });
  assert.equal(a.onNicheCount, 0);
  assert.deepEqual(a.formats, []);
});
