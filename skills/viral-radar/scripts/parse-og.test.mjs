import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOgDescription, decodeEntities } from "./parse-og.mjs";

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
