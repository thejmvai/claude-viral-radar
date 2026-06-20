import { test } from "node:test";
import assert from "node:assert/strict";
import { hookWords, buildIdeaContext, validateIdeas } from "./ideator.mjs";

const dataset = {
  niche: "ai-claude",
  label: "AI / Claude",
  nicheSynthesis: {
    whatsWorking: ["Teach one named skill", "Show the build, not the brag"],
    topPatterns: [{ pattern: "comment-to-DM gate", count: 20 }, { pattern: "spoken + on-screen text", count: 30 }],
    summary: "s",
  },
  reels: [
    { shortcode: "A", handle: "@a", hook: "high signal hook", format: "Talking-head", rankScore: 66, metrics: { views: 500000 }, whyItWorks: "loop" },
    { shortcode: "B", handle: "@b", hook: "mid hook", format: "Text-on-screen", rankScore: 40, metrics: { views: 80000 }, whyItWorks: "proof" },
    { shortcode: "C", handle: "@alfie", hook: "comedy", format: "Standup", rankScore: 99, metrics: { views: 9000000 }, trackingCategory: "inspiration" },
  ],
  crossPlatform: {
    themes: ["theme one"],
    sources: [{ platform: "Reddit", items: [{ title: "AI made me tired", url: "u" }] }],
  },
};

test("hookWords counts words", () => {
  assert.equal(hookWords("one two three"), 3);
  assert.equal(hookWords("  spaced   out  "), 2);
  assert.equal(hookWords(""), 0);
});

test("buildIdeaContext pulls top on-niche reels (excludes inspiration), patterns, plays, trends", () => {
  const ctx = buildIdeaContext(dataset, { topN: 5 });
  // inspiration reel @alfie (rankScore 99) must NOT appear despite top score
  assert.equal(ctx.topReels.length, 2);
  assert.equal(ctx.topReels[0].shortcode, "A"); // ranked by rankScore among on-niche
  assert.ok(!ctx.topReels.some((r) => r.handle === "@alfie"));
  assert.equal(ctx.patterns.length, 2);
  assert.deepEqual(ctx.whatsWorking, ["Teach one named skill", "Show the build, not the brag"]);
  assert.equal(ctx.trends[0].platform, "Reddit");
  assert.equal(ctx.label, "AI / Claude");
});

test("buildIdeaContext falls back to themes when no source items", () => {
  const ctx = buildIdeaContext({ ...dataset, crossPlatform: { themes: ["t1", "t2"], sources: [] } });
  assert.equal(ctx.trends[0].title, "t1");
});

const goodIdea = {
  hook: "Hot take, you do not need five AI tools",
  angle: "Most solopreneurs drown in tools. Show the one workflow that replaces them.",
  format: "Talking-head + on-screen text",
  grounding: { type: "pattern", ref: "comment-to-DM gate", note: "top pattern" },
};

test("validateIdeas passes a well-formed idea", () => {
  assert.deepEqual(validateIdeas([goodIdea]), []);
});

test("validateIdeas catches missing fields, long hooks, bad grounding, em dashes", () => {
  assert.match(validateIdeas([{ ...goodIdea, hook: "" }])[0], /missing hook/);
  assert.match(validateIdeas([{ ...goodIdea, hook: "one two three four five six seven eight nine ten eleven twelve thirteen" }])[0], /13 words/);
  assert.match(validateIdeas([{ ...goodIdea, angle: "" }])[0], /missing angle/);
  assert.match(validateIdeas([{ ...goodIdea, format: "" }])[0], /missing format/);
  assert.match(validateIdeas([{ ...goodIdea, grounding: {} }])[0], /missing grounding.ref/);
  assert.match(validateIdeas([{ ...goodIdea, grounding: { ref: "x", type: "bogus" } }])[0], /invalid/);
  assert.match(validateIdeas([{ ...goodIdea, angle: "this has an em dash — right here" }])[0], /em dash/);
  assert.deepEqual(validateIdeas([]), ["ideas is empty"]);
  assert.deepEqual(validateIdeas("nope"), ["ideas is not an array"]);
});
