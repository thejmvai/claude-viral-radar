import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTelegramCreds,
  escapeHtml,
  formatViews,
  topReels,
  buildCoverage,
  topTrends,
  formatDigest,
  sendTelegramMessage,
} from "./notify-telegram.mjs";

const reel = (over = {}) => ({
  handle: "@someone",
  url: "https://www.instagram.com/reel/ABC/",
  hook: "a hook",
  rankScore: 50,
  postedAt: "2026-06-10",
  metrics: { views: 100000 },
  ...over,
});

const dataset = {
  niche: "ai-claude",
  label: "AI / Claude",
  generatedAt: "2026-06-18T09:00:00.000Z",
  reels: [
    reel({ handle: "@a", rankScore: 66, postedAt: "2026-06-11", hook: "high one", metrics: { views: 500557 }, url: "u-a" }),
    reel({ handle: "@a", rankScore: 40, postedAt: "2026-06-09", metrics: { views: 80000 }, url: "u-a2" }),
    reel({ handle: "@b_under_score", rankScore: 55, postedAt: "2026-06-08", hook: "b hook", metrics: { views: 256000 }, url: "u-b" }),
  ],
  crossPlatform: {
    window: "30d",
    summary: "stuff",
    themes: ["theme one", "theme two"],
    sources: [
      { platform: "Reddit", icon: "🟠", items: [{ title: "reddit post", url: "https://r/1", metric: "52 comments" }] },
      { platform: "YouTube", icon: "▶️", items: [{ title: "yt vid", url: "https://yt/1", metric: "1M views" }] },
    ],
  },
};

test("resolveTelegramCreds prefers env vars", () => {
  const c = resolveTelegramCreds({ TELEGRAM_BOT_TOKEN: "t1", TELEGRAM_CHAT_ID: "c1" }, "/nope", "/nope");
  assert.deepEqual(c, { token: "t1", chatId: "c1" });
});

test("resolveTelegramCreds returns empties when nothing set", () => {
  const c = resolveTelegramCreds({}, "/does/not/exist", "/does/not/exist");
  assert.deepEqual(c, { token: "", chatId: "" });
});

test("escapeHtml escapes & < > only", () => {
  assert.equal(escapeHtml('a & b < c > d'), "a &amp; b &lt; c &gt; d");
  assert.equal(escapeHtml(null), "");
});

test("formatViews renders K/M and raw", () => {
  assert.equal(formatViews(500557), "501K");
  assert.equal(formatViews(71849), "71.8K");
  assert.equal(formatViews(1234567), "1.2M");
  assert.equal(formatViews(12000000), "12M");
  assert.equal(formatViews(940), "940");
  assert.equal(formatViews(0), "?");
  assert.equal(formatViews(undefined), "?");
});

test("topReels sorts by rankScore desc, tie breaks to newer post", () => {
  const reels = [
    reel({ handle: "@low", rankScore: 10 }),
    reel({ handle: "@high", rankScore: 90 }),
    reel({ handle: "@tieOld", rankScore: 50, postedAt: "2026-01-01" }),
    reel({ handle: "@tieNew", rankScore: 50, postedAt: "2026-06-01" }),
  ];
  const t = topReels(reels, 3);
  assert.equal(t.length, 3);
  assert.equal(t[0].handle, "@high");
  assert.equal(t[1].handle, "@tieNew"); // newer wins the tie
  assert.equal(t[2].handle, "@tieOld");
});

test("buildCoverage counts channels + reels and sorts by count desc", () => {
  const cov = buildCoverage(dataset.reels);
  assert.equal(cov.reelCount, 3);
  assert.equal(cov.channelCount, 2);
  assert.equal(cov.perChannel[0].handle, "@a");
  assert.equal(cov.perChannel[0].count, 2);
});

test("topTrends flattens source items and caps at n", () => {
  const tr = topTrends(dataset.crossPlatform, 2);
  assert.equal(tr.length, 2);
  assert.equal(tr[0].platform, "Reddit");
  assert.equal(tr[0].url, "https://r/1");
  assert.equal(tr[1].platform, "YouTube");
});

test("topTrends falls back to themes when no source items", () => {
  const tr = topTrends({ themes: ["t1", "t2", "t3"], sources: [] }, 2);
  assert.equal(tr.length, 2);
  assert.equal(tr[0].title, "t1");
  assert.equal(tr[0].url, "");
});

test("topTrends returns [] when no crossPlatform", () => {
  assert.deepEqual(topTrends(undefined, 3), []);
});

test("formatDigest builds a structured HTML digest", () => {
  const text = formatDigest(dataset, { top: 2, trends: 2, minPerHandle: 5 });
  assert.match(text, /Viral Radar — AI \/ Claude/);
  assert.match(text, /2026-06-18/);
  assert.match(text, /<b>Top 2 reels<\/b>/);
  // highest rankScore reel first, as a link with its hook text
  assert.match(text, /1\. <a href="u-a">high one<\/a>/);
  assert.match(text, /@a · 501K views · rank 66/);
  // coverage line + under-floor callout (both channels < 5)
  assert.match(text, /<b>Coverage:<\/b> 2 channels · 3 reels/);
  assert.match(text, /Under 5\/handle:/);
  // hot section with escaped/linked trend
  assert.match(text, /🔥 <b>Hot across the niche<\/b>/);
  assert.match(text, /🟠 <a href="https:\/\/r\/1">reddit post<\/a>/);
  assert.ok(text.length <= 4096);
});

test("formatDigest collapses a long under-floor list to a count", () => {
  const reels = Array.from({ length: 9 }, (_, i) => reel({ handle: `@c${i}` })); // 9 single-reel channels
  const text = formatDigest({ label: "n", generatedAt: "2026-06-18", reels }, { minPerHandle: 5 });
  assert.match(text, /9 channels under 5\/handle/);
  assert.doesNotMatch(text, /Under 5\/handle: @c0/);
});

test("formatDigest excludes inspiration-lane reels from the top list + coverage", () => {
  const d = { label: "n", generatedAt: "2026-06-18", reels: [
    reel({ handle: "@onniche", rankScore: 50, hook: "on niche hook", url: "u1" }),
    reel({ handle: "@alfie_dundas", rankScore: 99, hook: "comedy bit", url: "u2", trackingCategory: "inspiration" }),
  ]};
  const text = formatDigest(d, { top: 5 });
  assert.match(text, /on niche hook/);
  assert.doesNotMatch(text, /comedy bit/);      // excluded despite a higher rankScore
  assert.doesNotMatch(text, /alfie_dundas/);     // and out of the coverage line
});

test("formatDigest handles empty reels and missing crossPlatform", () => {
  const text = formatDigest({ niche: "x", generatedAt: "2026-06-18T00:00:00Z", reels: [] });
  assert.match(text, /Viral Radar — x/);
  assert.match(text, /No reels this run\./);
  assert.doesNotMatch(text, /Hot across the niche/);
});

test("formatDigest escapes HTML-unsafe chars in hooks", () => {
  const text = formatDigest({
    label: "n", generatedAt: "2026-06-18",
    reels: [reel({ hook: "tools & <tricks>", url: "u" })],
  });
  assert.match(text, /tools &amp; &lt;tricks&gt;/);
});

test("sendTelegramMessage posts to the Telegram API and returns the result", async () => {
  let captured;
  const fakeFetch = async (url, opts) => {
    captured = { url, opts };
    return { status: 200, json: async () => ({ ok: true, result: { message_id: 42 } }) };
  };
  const result = await sendTelegramMessage(
    { token: "TKN", chatId: "CHAT", text: "hi" },
    fakeFetch
  );
  assert.equal(result.message_id, 42);
  assert.equal(captured.url, "https://api.telegram.org/botTKN/sendMessage");
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.chat_id, "CHAT");
  assert.equal(body.text, "hi");
  assert.equal(body.parse_mode, "HTML");
  assert.equal(body.disable_web_page_preview, true);
});

test("sendTelegramMessage throws with the API description on failure", async () => {
  const fakeFetch = async () => ({ status: 400, json: async () => ({ ok: false, description: "chat not found" }) });
  await assert.rejects(
    () => sendTelegramMessage({ token: "t", chatId: "bad", text: "x" }, fakeFetch),
    /chat not found/
  );
});

test("truncateForTelegram cuts at a line boundary, never mid-tag", async () => {
  const { truncateForTelegram } = await import("./notify-telegram.mjs");
  const line = `1. <a href="https://example.com/x">a hook</a>`;
  const text = Array.from({ length: 200 }, () => line).join("\n");
  const out = truncateForTelegram(text, 4096);
  assert.ok(out.length <= 4096);
  assert.equal((out.match(/<a /g) || []).length, (out.match(/<\/a>/g) || []).length);
  assert.ok(out.endsWith("…"));
  // single giant line: the dangling tag is stripped instead
  const one = "x".repeat(4080) + '<a href="https://e.com/long-url">t</a>';
  const cut = truncateForTelegram(one, 4096);
  assert.ok(cut.length <= 4096);
  assert.doesNotMatch(cut, /<a [^>]*$/);
  // under the limit passes through untouched
  assert.equal(truncateForTelegram("short", 4096), "short");
});

test("formatViews renders B-tier counts", () => {
  assert.equal(formatViews(1.2e9), "1.2B");
  assert.equal(formatViews(2.34e10), "23B");
});
