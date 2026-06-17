import { test } from "node:test";
import assert from "node:assert/strict";
import { likeRate, commentRate, breakout, reachMultiple, qualityFlag, isViral, replicability, signalScore } from "./score.mjs";

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
