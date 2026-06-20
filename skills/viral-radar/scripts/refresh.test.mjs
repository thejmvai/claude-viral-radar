import { test } from "node:test";
import assert from "node:assert/strict";
import { chromeLaunchArgv, scrapeArgv, claudeEnrichPrompt, claudeArgv, chromeReachable } from "./refresh.mjs";

test("chromeLaunchArgv has the debug port, allowed origins, profile, and start url", () => {
  const argv = chromeLaunchArgv("/tmp/prof", 9222);
  assert.deepEqual(argv, [
    "--remote-debugging-port=9222",
    "--remote-allow-origins=*",
    "--user-data-dir=/tmp/prof",
    "https://www.instagram.com/",
  ]);
});

test("scrapeArgv passes niche + out, and handles only when given", () => {
  assert.deepEqual(scrapeArgv("ai-claude", "viral-radar-out/worklist-ai-claude.json"), [
    "--niche=ai-claude", "--out=viral-radar-out/worklist-ai-claude.json",
  ]);
  assert.deepEqual(scrapeArgv("ai-claude", "w.json", "a,b"), [
    "--niche=ai-claude", "--out=w.json", "--handles=a,b",
  ]);
});

test("claudeEnrichPrompt references the work-list, forbids re-scraping, and forbids backgrounding", () => {
  const p = claudeEnrichPrompt("ai-claude", "viral-radar-out/worklist-ai-claude.json");
  assert.match(p, /\/viral-radar/);
  assert.match(p, /worklist-ai-claude\.json/);
  assert.match(p, /do NOT scrape again/i);
  assert.match(p, /will NOT be re-invoked/i);
  assert.match(p, /Do NOT background/i);
  assert.match(p, /digest/i);
});

test("claudeArgv adds print + skip-permissions, and model when given", () => {
  assert.deepEqual(claudeArgv("hi"), ["-p", "hi", "--dangerously-skip-permissions"]);
  assert.deepEqual(claudeArgv("hi", { skipPermissions: false }), ["-p", "hi"]);
  assert.deepEqual(claudeArgv("hi", { model: "claude-opus-4-8" }), [
    "-p", "hi", "--dangerously-skip-permissions", "--model", "claude-opus-4-8",
  ]);
});

test("chromeReachable is true on a 200 and false when fetch throws", async () => {
  const ok = await chromeReachable(9222, async () => ({ ok: true, status: 200 }));
  const down = await chromeReachable(9222, async () => { throw new Error("ECONNREFUSED"); });
  assert.equal(ok, true);
  assert.equal(down, false);
});
