import { test } from "node:test";
import assert from "node:assert/strict";
import { collectReferencedShortcodes, planCleanup } from "./cleanup.mjs";

test("collectReferencedShortcodes unions reels, quarantined, offTopic across datasets", () => {
  const refs = collectReferencedShortcodes([
    { reels: [{ shortcode: "A" }], quarantined: [{ shortcode: "B" }] },
    { reels: [{ shortcode: "A" }], offTopic: [{ shortcode: "C" }] },
    null,
  ]);
  assert.deepEqual([...refs].sort(), ["A", "B", "C"]);
});

test("planCleanup keeps the newest N archives and only referenced frames", () => {
  const day = 86400000;
  const now = Date.now();
  const plan = planCleanup({
    archives: ["2026-06-18", "2026-06-20", "2026-06-24", "2026-07-05", "2026-07-05-1324", "2026-07-05-1335"].map((name) => ({ name })),
    frames: ["A", "B", "C"],
    referenced: new Set(["A", "C"]),
    worklists: [{ name: "worklist-old.json", mtimeMs: now - 10 * day }, { name: "worklist-new.json", mtimeMs: now - day }],
    baks: [{ name: ".bak-old", mtimeMs: now - 45 * day }, { name: ".bak-new", mtimeMs: now - day }],
    keepArchives: 4,
    now,
  });
  assert.deepEqual(plan.deleteArchives, ["2026-06-18", "2026-06-20"]); // oldest two go
  assert.deepEqual(plan.deleteFrames, ["B"]);
  assert.deepEqual(plan.deleteWorklists, ["worklist-old.json"]);
  assert.deepEqual(plan.deleteBaks, [".bak-old"]);
});

test("planCleanup with keepArchives >= count deletes nothing", () => {
  const plan = planCleanup({ archives: [{ name: "2026-07-05" }], frames: [], keepArchives: 5 });
  assert.deepEqual(plan.deleteArchives, []);
});
