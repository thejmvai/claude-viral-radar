import { test } from "node:test";
import assert from "node:assert/strict";
import { likeRate, commentRate, breakout, reachMultiple, qualityFlag, isViral, replicability, signalScore, ageHoursFrom, recencyScore, rankScore, rankReels } from "./score.mjs";

test("rate metrics", () => {
  assert.equal(likeRate(26000, 1000000).toFixed(3), "0.026");
  assert.equal(commentRate(41000, 1000000).toFixed(3), "0.041");
});

test("breakout and reach", () => {
  assert.equal(breakout(1000000, 111000).toFixed(1), "9.0");
  assert.equal(reachMultiple(1000000, 80358).toFixed(1), "12.4");
});

test("quality gate flags boosted reels", () => {
  // 9.8M views, 842 likes => 0.0086% like-rate => boosted
  assert.equal(qualityFlag(842 / 9800000), "boosted");
  assert.equal(qualityFlag(0.026), "ok");
});

test("isViral: absolute and velocity", () => {
  const cfg = { viralThreshold: 100000, velocityThreshold: 50000, velocityWindowHours: 48 };
  assert.equal(isViral({ views: 120000, ageHours: 500 }, cfg), true);
  assert.equal(isViral({ views: 60000, ageHours: 30 }, cfg), true); // velocity
  assert.equal(isViral({ views: 60000, ageHours: 100 }, cfg), false); // too old, below absolute
  assert.equal(isViral({ views: 40000, ageHours: 10 }, cfg), false);
});

test("replicability decays with follower size", () => {
  assert.equal(replicability(80000), 1);
  assert.ok(replicability(5000000) <= 0.3);
  assert.ok(replicability(600000) < 1 && replicability(600000) > 0.3);
});

test("signalScore is 0-100 and rewards quality", () => {
  const strong = signalScore({ likeRate: 0.027, commentRate: 0.041, ctaType: "organic", breakout: 9, followers: 80000 });
  const weak = signalScore({ likeRate: 0.002, commentRate: 0.001, ctaType: "organic", breakout: 2, followers: 5000000 });
  assert.ok(strong > 60 && strong <= 100);
  assert.ok(weak < strong);
});

test("ageHoursFrom handles dates and clamps the future", () => {
  const now = new Date("2026-06-17T00:00:00Z");
  assert.equal(ageHoursFrom("2026-06-16T00:00:00Z", now), 24);
  assert.equal(ageHoursFrom("2026-06-18T00:00:00Z", now), 0); // future clamps to 0
  assert.equal(ageHoursFrom(null, now), Infinity);
});

test("recencyScore decays by half-life", () => {
  const now = new Date("2026-06-17T00:00:00Z");
  assert.equal(recencyScore("2026-06-17T00:00:00Z", now, 30).toFixed(2), "1.00"); // today
  assert.equal(recencyScore("2026-05-18T00:00:00Z", now, 30).toFixed(2), "0.50"); // ~30d => half
  assert.ok(recencyScore("2025-12-17T00:00:00Z", now, 30) < 0.05); // ~6mo => near zero
});

test("rankScore blends signal and recency by weight", () => {
  const now = new Date("2026-06-17T00:00:00Z");
  const fresh = { signalScore: 60, postedAt: "2026-06-16T00:00:00Z", now, recencyWeight: 0.35, halfLifeDays: 30 };
  const stale = { signalScore: 60, postedAt: "2025-12-17T00:00:00Z", now, recencyWeight: 0.35, halfLifeDays: 30 };
  assert.ok(rankScore(fresh) > rankScore(stale)); // same signal, fresher wins
  // weight 0 => pure signal
  assert.equal(rankScore({ ...stale, recencyWeight: 0 }), 60);
});

test("rankReels orders by blended score and assigns rank", () => {
  const now = new Date("2026-06-17T00:00:00Z");
  const reels = [
    { shortcode: "a", signalScore: 90, postedAt: "2025-12-01" }, // high signal, old
    { shortcode: "b", signalScore: 55, postedAt: "2026-06-15" }, // mid signal, very fresh
    { shortcode: "c", signalScore: 40, postedAt: "2026-01-01" }, // low signal, old
  ];
  const ranked = rankReels(reels, { now, recencyWeight: 0.35, halfLifeDays: 30 });
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[ranked.length - 1].rank, ranked.length);
  ranked.forEach((r) => assert.ok(typeof r.rankScore === "number" && r.recencyScore >= 0 && r.recencyScore <= 1));
  assert.equal(ranked[2].shortcode, "c"); // weakest on both axes ends last
});
