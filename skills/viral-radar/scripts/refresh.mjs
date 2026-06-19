// Scheduled auto-refresh (Full): ensure the debug Chrome is up, run the full /viral-radar pipeline
// headless via `claude -p`, and alert on Telegram if it fails. Driven by a launchd job (see
// guides/setup-scheduled-refresh.md). The skill itself sends the digest (Step 7.5). See
// workflows/scheduled-refresh.md.
//
// CLI: node scripts/refresh.mjs [--niche=ai-claude] [--port=9222] [--project-dir=<cwd>]
//        [--profile=$HOME/.viral-radar-chrome] [--model=<id>] [--no-launch-chrome]
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveTelegramCreds, sendTelegramMessage } from "./notify-telegram.mjs";

const DEFAULT_CHROME_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// --- pure helpers (unit-tested) ----------------------------------------------
export function chromeLaunchArgv(profileDir, port = 9222, startUrl = "https://www.instagram.com/") {
  return [
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDir}`,
    startUrl,
  ];
}

// The headless prompt: full refresh via the no-MCP CDP scraper (MCP isn't loaded under `claude -p`).
export function claudeRefreshPrompt(niche) {
  return (
    `/viral-radar run a full refresh for niche "${niche}". The chrome-devtools MCP is NOT available, ` +
    `so use the "Step 2 (no MCP)" path with scripts/scrape-cdp.mjs for detection (Chrome is already ` +
    `running on :9222 logged into Instagram). Then run enrichment, ranking, report render, and send the ` +
    `Telegram digest (Step 7.5) as normal. Do not ask for confirmation; complete the whole pipeline.`
  );
}

export function claudeArgv(prompt, { model = "", skipPermissions = true } = {}) {
  const argv = ["-p", prompt];
  if (skipPermissions) argv.push("--dangerously-skip-permissions");
  if (model) argv.push("--model", model);
  return argv;
}

export async function chromeReachable(port = 9222, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/json/version`);
    return !!(res && (res.ok || res.status === 200));
  } catch {
    return false;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function alert(text) {
  const { token, chatId } = resolveTelegramCreds();
  if (!token || !chatId) { console.error("(no Telegram creds — cannot alert)"); return; }
  try { await sendTelegramMessage({ token, chatId, text }); } catch (e) { console.error("alert failed:", e.message); }
}

// --- CLI ---------------------------------------------------------------------
function arg(name, def = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=").slice(1).join("=");
  return process.argv.includes(`--${name}`) ? true : def;
}

async function ensureChrome(port, profile, chromeBin) {
  if (await chromeReachable(port)) return true;
  console.log(`Chrome not on :${port} — launching…`);
  const child = spawn(chromeBin, chromeLaunchArgv(profile, port), { detached: true, stdio: "ignore" });
  child.unref();
  for (let i = 0; i < 20; i++) {
    await wait(1500);
    if (await chromeReachable(port)) return true;
  }
  return false;
}

function runClaude(claudeBin, argv, cwd) {
  return new Promise((resolve) => {
    const child = spawn(claudeBin, argv, { cwd, stdio: ["ignore", "inherit", "inherit"] });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (e) => { console.error("spawn claude failed:", e.message); resolve(127); });
  });
}

async function main() {
  const niche = arg("niche", "ai-claude");
  const port = Number(arg("port", 9222));
  const projectDir = arg("project-dir", process.cwd());
  const profile = arg("profile", path.join(os.homedir(), ".viral-radar-chrome"));
  const model = arg("model", "");
  const chromeBin = arg("chrome-bin", process.env.CHROME_BIN || DEFAULT_CHROME_MAC);
  const claudeBin = arg("claude-bin", process.env.CLAUDE_BIN || "claude");

  console.log(`[refresh] niche=${niche} port=${port} dir=${projectDir}`);

  if (arg("no-launch-chrome") !== true) {
    const up = await ensureChrome(port, profile, chromeBin);
    if (!up) {
      await alert(`🛰️ Viral Radar refresh aborted: Chrome never came up on :${port}. Check the debug Chrome / Instagram login.`);
      console.error("Chrome unreachable — aborting.");
      process.exit(1);
    }
  }

  const argv = claudeArgv(claudeRefreshPrompt(niche), { model });
  console.log(`[refresh] running: ${claudeBin} ${argv.slice(0, 2).join(" ")} …`);
  const code = await runClaude(claudeBin, argv, projectDir);

  if (code !== 0) {
    await alert(`🛰️ Viral Radar refresh failed (claude exited ${code}). Check ${path.join(projectDir, "viral-radar-out/refresh.log")}.`);
    console.error(`claude exited ${code}`);
    process.exit(code);
  }
  console.log("[refresh] done — the skill sent the digest if credentials are set.");
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
