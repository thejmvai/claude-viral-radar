import { test } from "node:test";
import assert from "node:assert/strict";
import { normHandle, parseReel, discoveryScore, aggregateCreators, resolveKey } from "./discover.mjs";

test("normHandle strips @ and lowercases", () => {
  assert.equal(normHandle("@NateHerk"), "nateherk");
  assert.equal(normHandle("  Cooper.Simson "), "cooper.simson");
  assert.equal(normHandle(""), "");
});

test("parseReel normalizes a ScrapeCreators reel", () => {
  const r = parseReel({
    id: "123", shortcode: "ABC", caption: { text: "AI agents 101" },
    video_play_count: 250000, like_count: 9000, comment_count: 120,
    owner: { username: "SomeCreator" }, taken_at: "2026-06-10T12:00:00.000Z",
  });
  assert.equal(r.handle, "somecreator");
  assert.equal(r.views, 250000);
  assert.equal(r.date, "2026-06-10");
  assert.equal(r.url, "https://www.instagram.com/reel/ABC/");
  assert.equal(parseReel({ owner: {} }), null); // no handle -> dropped
});

test("discoveryScore rewards reach, presence, recency", () => {
  const now = new Date("2026-06-18T00:00:00Z");
  const big = discoveryScore({ bestViews: 3_000_000, count: 3, latestDate: "2026-06-15" }, { now });
  const small = discoveryScore({ bestViews: 60_000, count: 1, latestDate: "2026-01-01" }, { now });
  assert.ok(big > small);
  assert.ok(big > 0 && big <= 100);
});

test("aggregateCreators groups, excludes known handles, applies min-views, dedupes", () => {
  const now = new Date("2026-06-18T00:00:00Z");
  const reels = [
    { id: "1", handle: "newbie", views: 800000, likes: 1, comments: 1, caption: "hot", date: "2026-06-15", url: "u1" },
    { id: "1", handle: "newbie", views: 800000, likes: 1, comments: 1, caption: "dup", date: "2026-06-15", url: "u1" }, // dup id
    { id: "2", handle: "newbie", views: 120000, likes: 1, comments: 1, caption: "two", date: "2026-06-10", url: "u2" },
    { id: "3", handle: "nateherk", views: 999999, likes: 1, comments: 1, caption: "tracked", date: "2026-06-12", url: "u3" }, // excluded
    { id: "4", handle: "tiny", views: 1000, likes: 1, comments: 1, caption: "small", date: "2026-06-12", url: "u4" }, // below min
  ];
  const out = aggregateCreators(reels, { exclude: ["@NateHerk"], minViews: 50000, now });
  assert.equal(out.length, 1);
  assert.equal(out[0].handle, "newbie");
  assert.equal(out[0].nicheReels, 2); // dup id collapsed
  assert.equal(out[0].bestViews, 800000);
});

test("discoveryScore penalizes single-hit creators (same reach, fewer niche reels)", () => {
  const now = new Date("2026-06-18T00:00:00Z");
  const oneHit = discoveryScore({ bestViews: 4_000_000, count: 1, latestDate: "2026-06-15" }, { now });
  const multi = discoveryScore({ bestViews: 4_000_000, count: 3, latestDate: "2026-06-15" }, { now });
  assert.ok(oneHit < multi); // identical reach, but a single niche reel is halved
});

test("aggregateCreators flags single-match off-niche giants and ranks them below qualified", () => {
  const now = new Date("2026-06-18T00:00:00Z");
  const reels = [
    // off-niche giant caught on ONE Claude-tagged reel (the alfie_dundas case)
    { id: "g1", handle: "alfie_dundas", views: 4_000_000, likes: 1, comments: 1, caption: "Claude made this video", date: "2026-06-15", url: "u" },
    // genuine niche creator: two solid reels, far less reach
    { id: "n1", handle: "realcreator", views: 200000, likes: 1, comments: 1, caption: "ai agents", date: "2026-06-14", url: "u" },
    { id: "n2", handle: "realcreator", views: 150000, likes: 1, comments: 1, caption: "claude code", date: "2026-06-13", url: "u" },
  ];
  const out = aggregateCreators(reels, { minViews: 50000, now, minNicheReels: 2 });
  const giant = out.find((c) => c.handle === "alfie_dundas");
  const real = out.find((c) => c.handle === "realcreator");
  assert.equal(giant.singleMatch, true);
  assert.equal(real.singleMatch, false);
  assert.equal(out[0].handle, "realcreator"); // qualified first despite 20x less reach
  assert.ok(out.indexOf(real) < out.indexOf(giant));
});

test("resolveKey prefers env var", () => {
  assert.equal(resolveKey({ SCRAPECREATORS_API_KEY: "k123" }), "k123");
});
