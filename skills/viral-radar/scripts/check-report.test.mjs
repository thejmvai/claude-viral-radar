import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractAssetRefs, verifyReportAssets, formatCheck } from "./check-report.mjs";

test("extractAssetRefs pulls src and href values in order", () => {
  const html = `<img src="frames/A/1.jpg"><a href="https://x.com/p">x</a><img src="data:image/jpeg;base64,AA">`;
  assert.deepEqual(extractAssetRefs(html), ["frames/A/1.jpg", "https://x.com/p", "data:image/jpeg;base64,AA"]);
});

test("verifyReportAssets flags missing local refs, passes existing, skips data/external/anchors", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vr-check-"));
  fs.mkdirSync(path.join(dir, "frames/A"), { recursive: true });
  fs.writeFileSync(path.join(dir, "frames/A/1.jpg"), "x");
  const html = `
    <img src="frames/A/1.jpg">
    <img src="frames/B/1.jpg">
    <img src="data:image/jpeg;base64,AA">
    <a href="https://instagram.com/reel/X/">r</a>
    <a href="#top">t</a>`;
  const res = verifyReportAssets(html, dir);
  assert.equal(res.local, 2);
  assert.deepEqual(res.missing, ["frames/B/1.jpg"]);
  assert.equal(res.dataUris, 1);
  assert.equal(res.external, 1);
  assert.equal(res.anchors, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("verifyReportAssets flags empty refs; formatCheck verdicts read right", () => {
  const res = verifyReportAssets(`<a href="">dead</a>`, "/tmp");
  assert.deepEqual(res.missing, ["(empty ref)"]);
  assert.match(formatCheck(res, "r.html"), /BROKEN/);
  assert.match(formatCheck({ local: 5, missing: [], dataUris: 2, external: 3, anchors: 0 }), /5 local refs resolve/);
});
