import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUserReel, parseUserReelsResponse, buildHandleWorklist } from "./scrape-api.mjs";

const CFG = { viralThreshold: 100000, velocityThreshold: 50000, velocityWindowHours: 48, qualityGateLikeRate: 0.005 };
// Fixed "now" so the velocity age rule is deterministic.
const NOW = new Date("2026-06-24T00:00:00.000Z");

test("parseUserReel maps SC fields + unix taken_at", () => {
  const r = parseUserReel({
    shortcode: "ABC123", play_count: 250000, like_count: 9000, comment_count: 120,
    taken_at: Math.floor(new Date("2026-06-20T00:00:00Z").getTime() / 1000),
    caption: { text: "hello world" },
  });
  assert.equal(r.shortcode, "ABC123");
  assert.equal(r.views, 250000);
  assert.equal(r.likes, 9000);
  assert.equal(r.comments, 120);
  assert.equal(r.date, "2026-06-20");
  assert.equal(r.caption, "hello world");
  assert.equal(r.url, "https://www.instagram.com/reel/ABC123/");
});

test("parseUserReel unwraps {media} / {node} and uses field aliases", () => {
  const wrapped = parseUserReel({ media: { code: "WRAP1", video_view_count: 80000 } });
  assert.equal(wrapped.shortcode, "WRAP1");
  assert.equal(wrapped.views, 80000);
  const node = parseUserReel({ node: { shortcode: "NODE1", video_play_count: 12345 } });
  assert.equal(node.shortcode, "NODE1");
  assert.equal(node.views, 12345);
});

test("parseUserReel returns null without a shortcode", () => {
  assert.equal(parseUserReel({ play_count: 999 }), null);
  assert.equal(parseUserReel(null), null);
});

test("parseUserReelsResponse extracts followers + reels across envelope shapes", () => {
  const a = parseUserReelsResponse({ user: { follower_count: 130000 }, reels: [{ shortcode: "A", play_count: 1 }] });
  assert.equal(a.followers, 130000);
  assert.equal(a.reels.length, 1);
  // alternate envelope: items[] + nested data.user
  const b = parseUserReelsResponse({ data: { user: { followers: 5000 } }, items: [{ media: { code: "B", play_count: 2 } }] });
  assert.equal(b.followers, 5000);
  assert.equal(b.reels[0].shortcode, "B");
  // empty / junk
  assert.deepEqual(parseUserReelsResponse(null), { followers: null, reels: [] });
});

test("buildHandleWorklist keeps absolute virals and drops below-floor reels", () => {
  const reels = [
    { shortcode: "HIT", views: 500000, likes: 25000, comments: 100, date: "2026-06-10" }, // absolute
    { shortcode: "LOW", views: 20000, likes: 1000, comments: 5, date: "2026-06-23" },      // below velocity floor
  ];
  const { reels: out, followers, fetched } = buildHandleWorklist({ handle: "creator", reels, followers: 200000, cfg: CFG, now: NOW });
  assert.equal(fetched, 2);
  assert.equal(followers, 200000);
  assert.equal(out.length, 1);
  assert.equal(out[0].shortcode, "HIT");
  assert.equal(out[0].viralReason, "absolute");
  assert.equal(out[0].handle, "@creator");
  assert.equal(out[0].discoveredVia, "tracked");
  assert.equal(out[0].metrics.views, 500000);
  assert.ok(out[0].signalScore >= 0 && out[0].signalScore <= 100);
  assert.ok("qualityFlag" in out[0]);
});

test("buildHandleWorklist applies the velocity window age rule", () => {
  const fresh = [{ shortcode: "FRESH", views: 60000, likes: 3000, comments: 40, date: "2026-06-23" }]; // <48h, >=velocity
  const stale = [{ shortcode: "STALE", views: 60000, likes: 3000, comments: 40, date: "2026-06-01" }]; // old velocity-band
  assert.equal(buildHandleWorklist({ handle: "c", reels: fresh, cfg: CFG, now: NOW }).reels[0].viralReason, "velocity");
  assert.equal(buildHandleWorklist({ handle: "c", reels: stale, cfg: CFG, now: NOW }).reels.length, 0);
});

test("buildHandleWorklist skips seen shortcodes", () => {
  const reels = [{ shortcode: "SEEN", views: 500000, likes: 25000, comments: 100, date: "2026-06-10" }];
  const out = buildHandleWorklist({ handle: "c", reels, cfg: CFG, seen: { SEEN: { enriched: true } }, now: NOW });
  assert.equal(out.reels.length, 0);
});

test("buildHandleWorklist stamps the inspiration lane", () => {
  const reels = [{ shortcode: "INSP", views: 500000, likes: 25000, comments: 100, date: "2026-06-10" }];
  const out = buildHandleWorklist({ handle: "offniche", reels, cfg: CFG, now: NOW, trackingCategory: "inspiration" });
  assert.equal(out.reels[0].trackingCategory, "inspiration");
  // on-niche reels carry no trackingCategory key
  const onNiche = buildHandleWorklist({ handle: "c", reels, cfg: CFG, now: NOW });
  assert.equal("trackingCategory" in onNiche.reels[0], false);
});

test("buildHandleWorklist computes creatorMedianViews across the handle's reels", () => {
  const reels = [
    { shortcode: "A", views: 500000, likes: 25000, comments: 100, date: "2026-06-10" },
    { shortcode: "B", views: 300000, likes: 9000, comments: 50, date: "2026-06-12" },
    { shortcode: "C", views: 100000, likes: 2000, comments: 10, date: "2026-06-14" },
  ];
  const out = buildHandleWorklist({ handle: "c", reels, cfg: CFG, now: NOW });
  // median of [100000, 300000, 500000] = 300000, applied to every item
  assert.equal(out.reels[0].creatorMedianViews, 300000);
});

test("fetchUserReels retries, surfaces the API error instead of a silent 'fetch failed'", async () => {
  const { fetchUserReels } = await import("./scrape-api.mjs");
  let calls = 0;
  const failing = async () => { calls++; return { status: 402, json: async () => ({ success: false, message: "insufficient credits" }) }; };
  const r = await fetchUserReels("h", "k", { attempts: 3, fetchImpl: failing, waitMs: 0 });
  assert.equal(calls, 3);
  assert.equal(r.data, null);
  assert.match(r.error, /insufficient credits/);
  const okFetch = async () => ({ status: 200, json: async () => ({ success: true, reels: [], credits_remaining: 41 }) });
  const ok = await fetchUserReels("h", "k", { fetchImpl: okFetch });
  assert.equal(ok.error, null);
  assert.equal(ok.credits, 41);
});
