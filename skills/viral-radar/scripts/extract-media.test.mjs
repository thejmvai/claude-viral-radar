import { test } from "node:test";
import assert from "node:assert/strict";
import { frameTimecodes, hookFrameTimecodes, cookieArgs } from "./extract-media.mjs";

test("frameTimecodes spaces 4 frames across the clip", () => {
  const t = frameTimecodes(67, 4);
  assert.equal(t.length, 4);
  assert.ok(t[0] >= 2 && t[0] < t[1] && t[3] < 67);
  // monotonic
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
});

test("hookFrameTimecodes returns 0/1/2s clamped to the clip length", () => {
  assert.deepEqual(hookFrameTimecodes(67), [0, 1, 2]);
  assert.deepEqual(hookFrameTimecodes(1.5), [0, 1]); // 2s falls outside a 1.5s clip
  assert.deepEqual(hookFrameTimecodes(0.5), [0]);     // 0 is always included
});

test("cookieArgs prefers a cookies file, falls back to browser, defaults to none", () => {
  assert.deepEqual(cookieArgs({ cookiesFile: "/tmp/c.txt", cookiesFromBrowser: "chrome" }), ["--cookies", "/tmp/c.txt"]);
  assert.deepEqual(cookieArgs({ cookiesFromBrowser: "chrome" }), ["--cookies-from-browser", "chrome"]);
  assert.deepEqual(cookieArgs({}), []);
  assert.deepEqual(cookieArgs(), []);
});
