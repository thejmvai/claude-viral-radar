import { test } from "node:test";
import assert from "node:assert/strict";
import { chromeLaunchArgv, claudeRefreshPrompt, claudeArgv, chromeReachable } from "./refresh.mjs";

test("chromeLaunchArgv has the debug port, allowed origins, profile, and start url", () => {
  const argv = chromeLaunchArgv("/tmp/prof", 9222);
  assert.deepEqual(argv, [
    "--remote-debugging-port=9222",
    "--remote-allow-origins=*",
    "--user-data-dir=/tmp/prof",
    "https://www.instagram.com/",
  ]);
});

test("claudeRefreshPrompt names the niche and forces the no-MCP path + full pipeline", () => {
  const p = claudeRefreshPrompt("ai-claude");
  assert.match(p, /\/viral-radar/);
  assert.match(p, /ai-claude/);
  assert.match(p, /no MCP|no-MCP|scrape-cdp\.mjs/);
  assert.match(p, /digest/i);
  assert.match(p, /Do not ask for confirmation/i);
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
