import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOgDescription, decodeEntities, parseCount } from "./parse-og.mjs";

test("parseCount parses K/M/commas case-insensitively", () => {
  assert.equal(parseCount("1.2M"), 1200000);
  assert.equal(parseCount("847k"), 847000);
  assert.equal(parseCount("1,234 views"), 1234);
  assert.equal(parseCount("500K views"), 500000);
  assert.equal(parseCount(""), 0);
  assert.equal(parseCount(null), 0);
});

test("decodeEntities handles IG entity encodings", () => {
  assert.equal(decodeEntities("don&#039;t &amp; &quot;x&quot; &#x2014; &#064;h"), 'don\'t & "x" — @h');
});

test("parseOgDescription extracts counts, handle, date, caption", () => {
  const og =
    "26K likes, 41K comments - examplecreator on March 18, 2026: &quot;A demo caption for testing. Comment WORD&quot;. ";
  const r = parseOgDescription(og);
  assert.equal(r.likes, 26000);
  assert.equal(r.comments, 41000);
  assert.equal(r.handle, "examplecreator");
  assert.equal(r.postedAt, "2026-03-18");
  assert.match(r.caption, /demo caption for testing/);
});

test("parses exact small counts", () => {
  const og = "842 likes, 26 comments - samplehandle on April 23, 2026: &quot;Another demo caption&quot;. ";
  const r = parseOgDescription(og);
  assert.equal(r.likes, 842);
  assert.equal(r.comments, 26);
});

test("parseCount parses B-suffix counts (billion-view reels parsed as ~1 view before)", () => {
  assert.equal(parseCount("1.2B"), 1200000000);
  assert.equal(parseCount("2b views"), 2000000000);
  assert.equal(parseCount("3.5M"), 3500000); // control
});
