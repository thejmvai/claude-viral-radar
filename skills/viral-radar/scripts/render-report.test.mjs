import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReport } from "./render-report.mjs";

const ds = {
  niche: "ai-claude", generatedAt: "2026-06-17T05:10:00",
  nicheSynthesis: { whatsWorking: ["teach one skill"], topPatterns: [{ pattern: "claim-proof-cta", count: 1 }], summary: "s" },
  reels: [{
    rank: 1, shortcode: "Demo123XYZ", url: "https://www.instagram.com/reel/Demo123XYZ/",
    handle: "@democreator", creatorName: "Demo Creator", followers: 50000, discoveredVia: "tracked",
    postedAt: "2026-03-18", ageHoursAtCatch: 2160, viralReason: "absolute",
    metrics: { views: 1000000, likes: 26000, comments: 41000, durationSec: 67 },
    likeRate: 0.026, commentRate: 0.041, ctaType: "comment-to-DM", breakout: 9,
    creatorMedianViews: 111000, reachMultiple: 20, signalScore: 87, qualityFlag: "ok",
    hook: "This is a demo viral hook", hookDelivery: "spoken+text", format: "Talking-head demo",
    breakdown: "b", whyItWorks: "the demo reveal holds attention", transcript: "line one\nline two",
    storyboard: [{ timestamp: "0:03", role: "Hook", caption: "c", frame: "frames/Demo123XYZ/1.jpg" }],
    hookFrames: ["frames/Demo123XYZ/hook-0.jpg", "frames/Demo123XYZ/hook-1.jpg", "frames/Demo123XYZ/hook-2.jpg"],
    enrichedAt: "x", enrichmentEngine: "local",
  }],
  quarantined: [],
};

test("renders a standalone dark dossier with the key sections", () => {
  const html = renderReport(ds, { framesBaseUrl: "" });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /@democreator/);
  assert.match(html, /Top replicable plays/i);
  assert.match(html, /#1/);
  assert.match(html, /9&times;|9×/);
  assert.match(html, /This is a demo viral hook/);
  assert.match(html, /Talking-head demo/);
  assert.match(html, /Why it worked/i);
  assert.match(html, /Transcript/i);
  assert.match(html, /instagram\.com\/reel\/Demo123XYZ/);
});

test("renders the at-a-glance stat-bar", () => {
  const html = renderReport(ds, { framesBaseUrl: "" });
  assert.match(html, /class="statbar"/);
  assert.match(html, /passed gate/);
  assert.match(html, /top views/);
  assert.match(html, /transcribed/);
  assert.match(html, /1M/);      // top views compacted (1,000,000 -> 1M)
  assert.match(html, /100%/);    // 1 reel, 0 quarantined -> 100% passed gate
});

test("renders 0/1/2s hook frames when present", () => {
  const html = renderReport(ds, { framesBaseUrl: "" });
  assert.match(html, /class="hookframes"/);
  assert.match(html, /frames\/Demo123XYZ\/hook-0\.jpg/);
  assert.match(html, /<figcaption>0s<\/figcaption>/);
  assert.match(html, /<figcaption>2s<\/figcaption>/);
});

test("omits hook frames when a reel has none", () => {
  const noHook = JSON.parse(JSON.stringify(ds));
  delete noHook.reels[0].hookFrames;
  const html = renderReport(noHook, { framesBaseUrl: "" });
  assert.doesNotMatch(html, /class="hookframes"/);
});

test("renders an Off-niche tab with its own reels and a note", () => {
  const withOff = JSON.parse(JSON.stringify(ds));
  const ref = JSON.parse(JSON.stringify(ds.reels[0]));
  ref.handle = "@alfie_dundas";
  ref.hook = "off niche comedy bit";
  withOff.offNiche = [ref];
  const html = renderReport(withOff, { framesBaseUrl: "" });
  assert.match(html, /data-tab="offniche"/);
  assert.match(html, /Off-niche/);
  assert.match(html, /offnote/);
  assert.match(html, /off niche comedy bit/);
  assert.match(html, /@alfie_dundas/);
});

test("no Off-niche tab when offNiche is empty/absent", () => {
  const html = renderReport(ds, { framesBaseUrl: "" });
  assert.doesNotMatch(html, /data-tab="offniche"/);
});

test("escapes html in user content", () => {
  const evil = JSON.parse(JSON.stringify(ds));
  evil.reels[0].hook = '<script>alert(1)</script>';
  const html = renderReport(evil, { framesBaseUrl: "" });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});
