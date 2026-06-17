import { test } from "node:test";
import assert from "node:assert/strict";
import { frameTimecodes } from "./extract-media.mjs";

test("frameTimecodes spaces 4 frames across the clip", () => {
  const t = frameTimecodes(67, 4);
  assert.equal(t.length, 4);
  assert.ok(t[0] >= 2 && t[0] < t[1] && t[3] < 67);
  // monotonic
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
});
