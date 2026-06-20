// Scheduled auto-refresh (Full): ensure the debug Chrome is up, SCRAPE deterministically (so the long
// step can't be backgrounded), then run only the bounded agent work (enrich -> rank -> render -> digest)
// via `claude -p`. Alerts on Telegram if anything fails. Driven by a launchd job (see
// guides/setup-scheduled-refresh.md). See workflows/scheduled-refresh.md.
//
// Why two steps: a headless `claude -p` agent will background a long scrape and exit (it expects to be
// re-invoked, which never happens in print mode), leaving the pipeline unfinished. So refresh.mjs owns the
// scrape as a plain subprocess and hands the agent a ready work-list.
//
// CLI: node scripts/refresh.mjs [--niche=ai-claude] [--port=9222] [--project-dir=<cwd>]
//        [--handles=a,b] [--profile=$HOME/.viral-radar-chrome] [--model=<id>] [--no-launch-chrome]
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { resolveTelegramCreds, sendTelegramMessage } from "./notify-telegram.mjs";

const DEFAULT_CHROME_MAC = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// --- pure helpers (unit-tested) ----------------------------------------------
export function chromeLaunchArgv(profileDir, port = 9222, startUrl = "https://www.instagram.com/") {
  return [
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDir}`,
    startUrl,
  ];
}

export function scrapeArgv(niche, outPath, handles = "") {
  const a = [`--niche=${niche}`, `--out=${outPath}`];
  if (handles) a.push(`--handles=${handles}`);
  return a;
}

// The headless prompt: ONLY the bounded agent work, from an already-scraped work-list. The hard rule
// against backgrounding is load-bearing — without it the agent defers long steps and exits early.
export function claudeEnrichPrompt(niche, worklistPath) {
  return (
    `/viral-radar continue the pipeline for niche "${niche}" from the already-scraped work-list at ` +
    `${worklistPath} (its "reels" array is the Step 2 output — do NOT scrape again). Run Step 3 enrichment ` +
    `on each new reel (download media, transcribe, vision-analyze frames, set hookFrames), merge with the ` +
    `existing viral-radar-out/${niche}.json, then Step 4 ranking, Step 5 synthesis, Step 6 write + render ` +
    `the report, and Step 7.5 send the Telegram digest. ` +
    `CRITICAL: you are headless (claude -p) and will NOT be re-invoked. Run every command synchronously in ` +
    `the foreground and WAIT for each to finish. Do NOT background, defer, or hand off any step. Complete ` +
    `the entire pipeline before ending your response.`
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

// Run a subprocess to completion (stdout/stderr inherited). Resolves with the exit code.
function run(bin, argv, cwd) {
  return new Promise((resolve) => {
    const child = spawn(bin, argv, { cwd, stdio: ["ignore", "inherit", "inherit"] });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (e) => { console.error(`spawn ${bin} failed:`, e.message); resolve(127); });
  });
}

async function main() {
  const niche = arg("niche", "ai-claude");
  const port = Number(arg("port", 9222));
  const projectDir = arg("project-dir", process.cwd());
  const handles = arg("handles", "");
  const profile = arg("profile", path.join(os.homedir(), ".viral-radar-chrome"));
  const model = arg("model", "");
  const chromeBin = arg("chrome-bin", process.env.CHROME_BIN || DEFAULT_CHROME_MAC);
  const claudeBin = arg("claude-bin", process.env.CLAUDE_BIN || "claude");
  const worklistRel = path.join("viral-radar-out", `worklist-${niche}.json`);

  console.log(`[refresh] niche=${niche} port=${port} dir=${projectDir}${handles ? ` handles=${handles}` : ""}`);

  if (arg("no-launch-chrome") !== true) {
    const up = await ensureChrome(port, profile, chromeBin);
    if (!up) {
      await alert(`🛰️ Viral Radar refresh aborted: Chrome never came up on :${port}. Check the debug Chrome / Instagram login.`);
      console.error("Chrome unreachable — aborting.");
      process.exit(1);
    }
  }

  // Step 2 — scrape deterministically (plain subprocess; cannot be backgrounded by an agent).
  console.log("[refresh] scraping (CDP)…");
  const scrapeCode = await run(process.execPath, [path.join(SCRIPT_DIR, "scrape-cdp.mjs"), ...scrapeArgv(niche, worklistRel, handles)], projectDir);
  if (scrapeCode !== 0) {
    await alert(`🛰️ Viral Radar refresh failed: the CDP scrape exited ${scrapeCode}. Check the debug Chrome / Instagram login.`);
    console.error(`scrape exited ${scrapeCode}`);
    process.exit(scrapeCode);
  }

  // Steps 3–7.5 — bounded agent work on the ready work-list (enrich → rank → render → digest).
  const argv = claudeArgv(claudeEnrichPrompt(niche, worklistRel), { model });
  console.log(`[refresh] enriching + rendering + digest via ${claudeBin} -p …`);
  const code = await run(claudeBin, argv, projectDir);
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
