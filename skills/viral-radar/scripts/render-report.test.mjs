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

test("inspiration reels go to their own tab, out of the main ranking + stat-bar", () => {
  const d = JSON.parse(JSON.stringify(ds)); // 1 normal reel
  const inspo = JSON.parse(JSON.stringify(ds.reels[0]));
  inspo.handle = "@alfie_dundas"; inspo.shortcode = "InspoXYZ";
  inspo.url = "https://www.instagram.com/reel/InspoXYZ/";
  inspo.hook = "off niche comedy bit"; inspo.trackingCategory = "inspiration";
  d.reels = [...d.reels, inspo];
  const html = renderReport(d, { framesBaseUrl: "" });
  assert.match(html, /data-tab="inspo"/);
  assert.match(html, /Inspiration lane &mdash;/); // the note
  assert.match(html, /off niche comedy bit/);     // rendered (in the inspo tab)
  // counts: 1 on-niche reel in the main tab + stat-bar, 1 in the inspiration tab
  assert.match(html, /Instagram Reels <span class="tcount">1<\/span>/);
  assert.match(html, /Inspiration <span class="tcount">1<\/span>/);
});

test("renders an Ideas tab from ds.ideas", () => {
  const d = JSON.parse(JSON.stringify(ds));
  d.ideas = [{ hook: "Hot take, you do not need five tools", angle: "the one-workflow reframe", format: "Talking-head", grounding: { type: "pattern", ref: "comment-to-DM gate", note: "top pattern" } }];
  const html = renderReport(d, { framesBaseUrl: "" });
  assert.match(html, /data-tab="ideas"/);
  assert.match(html, /Ideas <span class="tcount">1<\/span>/);
  assert.match(html, /Hot take, you do not need five tools/);
  assert.match(html, /comment-to-DM gate/);
});

test("no Ideas tab when ds.ideas is absent", () => {
  assert.doesNotMatch(renderReport(ds, { framesBaseUrl: "" }), /data-tab="ideas"/);
});

test("escapes html in user content", () => {
  const evil = JSON.parse(JSON.stringify(ds));
  evil.reels[0].hook = '<script>alert(1)</script>';
  const html = renderReport(evil, { framesBaseUrl: "" });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("badges an inspiration reel and leaves normal reels unbadged", () => {
  // The .pill-inspo CSS rule is always in the stylesheet; the badge itself is `class="pill-inspo"`.
  const plain = renderReport(ds, { framesBaseUrl: "" });
  assert.doesNotMatch(plain, /class="pill-inspo"/); // no badge span for a normal tracked reel

  const inspo = JSON.parse(JSON.stringify(ds));
  inspo.reels[0].trackingCategory = "inspiration";
  const html = renderReport(inspo, { framesBaseUrl: "" });
  assert.match(html, /class="pill-inspo"/);
  assert.match(html, /INSPIRATION/);
});

test("a partial reel (failed enrichment) renders without killing the report", () => {
  const partial = JSON.parse(JSON.stringify(ds));
  partial.reels.push({
    rank: 2, shortcode: "Partial1", url: "https://www.instagram.com/reel/Partial1/", handle: "@partial",
    storyboard: [], transcript: "", hook: "", format: "", breakdown: "", whyItWorks: "",
  });
  const html = renderReport(partial, { framesBaseUrl: "" });
  assert.match(html, /@partial/);      // the partial reel still shows
  assert.match(html, /@democreator/);  // and the good reel is unaffected
});

test("transcript is embedded once (copy reads the body; no data-tx duplication)", () => {
  const html = renderReport(ds, { framesBaseUrl: "" });
  assert.doesNotMatch(html, /data-tx=/);
  assert.match(html, /line one<br>line two/);
});
