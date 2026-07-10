import { test } from "node:test";
import assert from "node:assert/strict";
import { keywordHits, scoreRelevance, tagRelevance, splitOffTopic } from "./relevance.mjs";

const KW = ["claude", "claude code", "ai agent", "automation", "prompt", "chatgpt"];

test("keywordHits matches on word boundaries only (no 'ai' inside 'air')", () => {
  assert.deepEqual(keywordHits("I built this with Claude Code today", KW), ["claude", "claude code"]);
  assert.deepEqual(keywordHits("fresh air and painting", ["ai"]), []);
  assert.deepEqual(keywordHits("my AI agent runs the automation", KW), ["ai agent", "automation"]);
  assert.deepEqual(keywordHits("", KW), []);
});

test("scoreRelevance reads caption + hook + transcript together", () => {
  const r = { caption: "day in my life", hook: "watch this", transcript: "so I asked ChatGPT to write the prompt" };
  const { hits, matched } = scoreRelevance(r, KW);
  assert.equal(hits, 2);
  assert.deepEqual(matched.sort(), ["chatgpt", "prompt"]);
});

test("tagRelevance flags below-threshold reels off-topic, never inspiration reels", () => {
  const cfg = { nicheKeywords: KW, nicheMinKeywordHits: 2 };
  const reels = [
    { shortcode: "A", hook: "I automated my business with an AI agent", transcript: "claude does it" },
    { shortcode: "B", hook: "my morning routine", transcript: "gym then breakfast" },
    { shortcode: "C", hook: "gym motivation", trackingCategory: "inspiration" },
  ];
  const tagged = tagRelevance(reels, cfg);
  assert.equal(tagged[0].offTopic, false);
  assert.ok(tagged[0].nicheRelevance.hits >= 2);
  assert.equal(tagged[1].offTopic, true);
  assert.equal(tagged[2].offTopic, undefined);      // inspiration lane untouched
  assert.equal(tagged[2].nicheRelevance, undefined);
  const { onNiche, offTopic } = splitOffTopic(tagged);
  assert.deepEqual(offTopic.map((r) => r.shortcode), ["B"]);
  assert.deepEqual(onNiche.map((r) => r.shortcode), ["A", "C"]);
});

test("tagRelevance is a no-op without configured keywords", () => {
  const tagged = tagRelevance([{ shortcode: "A", hook: "whatever" }], {});
  assert.equal(tagged[0].offTopic, undefined);
});

test("one nicheStrongKeywords hit is on-niche even below the distinct-hit minimum", () => {
  // the live miss: a reel entirely about Claude connectors says "claude" 10 times -> ONE distinct
  // keyword -> old rule flagged it off-topic. One strong hit must now keep it on-niche.
  const cfg = { nicheKeywords: KW, nicheMinKeywordHits: 2, nicheStrongKeywords: ["claude", "anthropic"] };
  const reels = [
    { shortcode: "A", caption: "delete all your claude connectors", transcript: "I plug everything into Claude. Claude only lets you connect one." },
    { shortcode: "B", hook: "my morning routine", transcript: "gym then breakfast" },
  ];
  const tagged = tagRelevance(reels, cfg);
  assert.equal(tagged[0].offTopic, false);
  assert.equal(tagged[0].nicheRelevance.hits, 1); // still just one distinct regular keyword
  assert.deepEqual(tagged[0].nicheRelevance.strongMatched, ["claude"]);
  assert.equal(tagged[1].offTopic, true); // no strong hit, below min -> still off-topic
  assert.deepEqual(tagged[1].nicheRelevance.strongMatched, []);
});

test("a single NON-strong hit still fails the gate (strong tier is not a general min-1)", () => {
  const cfg = { nicheKeywords: KW, nicheMinKeywordHits: 2, nicheStrongKeywords: ["claude"] };
  const tagged = tagRelevance([{ shortcode: "A", caption: "I love automation" }], cfg);
  assert.equal(tagged[0].offTopic, true); // "automation" is a regular keyword; 1 < min and not strong
});

test("nicheStrongKeywords alone (no nicheKeywords) still tags", () => {
  const tagged = tagRelevance(
    [{ shortcode: "A", caption: "anthropic dropped a model" }, { shortcode: "B", caption: "leg day" }],
    { nicheStrongKeywords: ["anthropic"] },
  );
  assert.equal(tagged[0].offTopic, false);
  assert.equal(tagged[1].offTopic, true);
});

test("without nicheStrongKeywords configured the old behavior is unchanged", () => {
  const cfg = { nicheKeywords: KW, nicheMinKeywordHits: 2 };
  const tagged = tagRelevance([{ shortcode: "A", caption: "claude claude claude" }], cfg);
  assert.equal(tagged[0].offTopic, true); // exactly the old (pre-strong-tier) result
  assert.deepEqual(tagged[0].nicheRelevance.strongMatched, []);
});
