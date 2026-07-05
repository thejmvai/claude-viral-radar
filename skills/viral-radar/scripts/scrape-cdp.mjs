// MCP-free scraper: Step 2 detection over the raw Chrome DevTools Protocol, no chrome-devtools MCP
// (which disconnects mid-session). Dependency-free — Node's global WebSocket + fetch. Scrapes each
// tracked handle's /reels/ grid, fetches each viral candidate's og:description for exact engagement,
// computes preliminary metrics with score.mjs, and writes a work-list the enrichment step consumes.
// See workflows/scrape-cdp.md (incl. the Chrome --remote-debugging-port launch command).
//
// CLI: node scripts/scrape-cdp.mjs [--niche=ai-claude] [--port=9222] [--target=36]
//        [--handles=a,b] [--out=<path>]
import fs from "node:fs";
import path from "node:path";
import { parseOgDescription, parseCount } from "./parse-og.mjs";
import {
  likeRate, commentRate, breakout, reachMultiple, qualityFlag, signalScore, isViral, ageHoursFrom,
} from "./score.mjs";

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const normHandle = (h) => String(h || "").trim().replace(/^@/, "").toLowerCase();

// --- raw CDP client (dependency-free) ----------------------------------------
export async function listTargets(port = 9222, fetchImpl = fetch) {
  const res = await fetchImpl(`http://127.0.0.1:${port}/json/list`);
  return res.json();
}

// Pick a usable page target, preferring one already on instagram.com.
export function pickPageTarget(targets, urlIncludes = "instagram.com") {
  const pages = (targets || []).filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
  return pages.find((t) => (t.url || "").includes(urlIncludes)) || pages[0] || null;
}

export class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this._id = 0;
    this._pending = new Map();
    this.ws.addEventListener("message", (ev) => this._onMessage(ev));
  }
  static async connect(wsUrl, { WebSocketImpl = WebSocket } = {}) {
    const ws = new WebSocketImpl(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", (e) => reject(new Error("CDP WebSocket error: " + (e && e.message || "failed to connect"))), { once: true });
    });
    return new CdpClient(ws);
  }
  _onMessage(ev) {
    let msg;
    try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); } catch { return; }
    if (msg.id && this._pending.has(msg.id)) {
      const { resolve, reject } = this._pending.get(msg.id);
      this._pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }
  // timeoutMs: a hung Chrome target (crashed tab, dead renderer) must fail the command, not hang the
  // whole scrape forever — the pending entry is cleaned up so it can't leak either.
  send(method, params = {}, { timeoutMs = 30000 } = {}) {
    const id = ++this._id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      timer.unref?.();
      this._pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression, { awaitPromise = false } = {}) {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (r && r.exceptionDetails) throw new Error("evaluate failed: " + (r.exceptionDetails.text || "exception"));
    return r && r.result ? r.result.value : undefined;
  }
  async navigate(url) { return this.send("Page.navigate", { url }); }
  close() { try { this.ws.close(); } catch {} }
}

// --- browser-evaluated DOM reads (LIVE-GATED — selectors drift, validate on real IG) --------
// 1. Reel grid tiles -> [{ shortcode, viewsText }]
export const GRID_EXPR = `(() => {
  const out = [], seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/reel/"]')) {
    const m = (a.getAttribute('href') || '').match(/\\/reel\\/([\\w-]+)/);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const nums = (a.textContent || '').match(/[\\d.,]+\\s*[KMBkmb]?/g) || [];
    out.push({ shortcode: m[1], viewsText: nums.length ? nums[nums.length - 1].trim() : '' });
  }
  return out;
})()`;
// 2. Follower count. The profile og:description ("X Followers, Y Following, Z Posts") is the most
// drift-resistant source; fall back to the followers anchor's title span, then a "<n> followers" scan.
// Every branch requires a leading digit so a stray "." can't match.
export const FOLLOWERS_EXPR = `(() => {
  const og = document.querySelector('meta[property="og:description"]');
  if (og) { const m = (og.getAttribute('content') || '').match(/([\\d][\\d.,]*\\s*[KMBkmb]?)\\s+Followers/i); if (m) return m[1]; }
  const a = [...document.querySelectorAll('a[href*="/followers/"]')][0];
  if (a) {
    const t = a.querySelector('span[title]');
    if (t && /\\d/.test(t.getAttribute('title') || '')) return t.getAttribute('title');
    const m = (a.textContent || '').match(/[\\d][\\d.,]*\\s*[KMBkmb]?/);
    if (m) return m[0];
  }
  for (const el of document.querySelectorAll('header span, main span, li span')) {
    const m = (el.textContent || '').trim().match(/^([\\d][\\d.,]*\\s*[KMBkmb]?)\\s*followers$/i);
    if (m) return m[1];
  }
  return '';
})()`;
// 3. og:description on a reel page (server-rendered, reliable)
export const OG_EXPR = `(() => { const m = document.querySelector('meta[property="og:description"]'); return m ? m.getAttribute('content') : ''; })()`;

// --- pure helpers (unit-tested) ----------------------------------------------
export function median(nums) {
  const a = (nums || []).filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

// A grid tile + its og data -> a work-list reel (same pre-enrichment shape Step 2 produced inline).
// trackingCategory: pass "inspiration" for out-of-niche handles (tracked for hook/format/editing only).
// When set, it's stamped onto the reel so the report can badge it and synthesis can exclude it.
export function buildWorklistItem({ shortcode, views, og = {}, handle, followers, creatorMedianViews, viralReason, trackingCategory = null, now = new Date() }) {
  const likes = og.likes || 0;
  const comments = og.comments || 0;
  const postedAt = og.postedAt || null;
  const lr = likeRate(likes, views);
  const cr = commentRate(comments, views);
  const bo = breakout(views, creatorMedianViews);
  const item = {
    shortcode,
    url: `https://www.instagram.com/reel/${shortcode}/`,
    handle: handle.startsWith("@") ? handle : `@${handle}`,
    creatorName: "",
    followers: followers ?? null,
    discoveredVia: "tracked",
    postedAt,
    ageHoursAtCatch: Math.round(ageHoursFrom(postedAt, now)),
    viralReason,
    metrics: { views, likes, comments },
    likeRate: +lr.toFixed(5),
    commentRate: +cr.toFixed(5),
    breakout: +bo.toFixed(2),
    creatorMedianViews,
    reachMultiple: followers ? +reachMultiple(views, followers).toFixed(2) : null,
    signalScore: signalScore({ likeRate: lr, commentRate: cr, ctaType: "", breakout: bo, followers: followers || 0 }),
    qualityFlag: qualityFlag(lr),
  };
  if (trackingCategory) item.trackingCategory = trackingCategory;
  return item;
}

// Merge the tracked + inspiration handle lanes into one scrape list, de-duped and category-tagged.
// `explicit` (the --handles override) wins when present, but a handle's category is always derived
// from config membership so /viral-competitor's "newly added handles only" run still tags correctly.
export function resolveScrapeList(cfg = {}, explicit = []) {
  const inspo = new Set((cfg.inspirationHandles || []).map(normHandle));
  const base = (explicit && explicit.length)
    ? explicit
    : [...(cfg.trackedHandles || []), ...(cfg.inspirationHandles || [])];
  const seen = new Set();
  const out = [];
  for (const h of base) {
    const n = normHandle(h);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push({ handle: n, trackingCategory: inspo.has(n) ? "inspiration" : null });
  }
  return out;
}

// Which grid tiles even need an og fetch: views at/above the velocity floor.
export function candidateTiles(tiles, cfg) {
  return (tiles || [])
    .map((t) => ({ shortcode: t.shortcode, views: parseCount(t.viewsText) }))
    .filter((t) => t.shortcode && t.views >= (cfg.velocityThreshold ?? 50000));
}

// Final viral decision (reuses score.isViral) given views + age, returns reason or null.
export function viralReasonFor({ views, ageHours }, cfg) {
  if (views >= cfg.viralThreshold) return "absolute";
  if (isViral({ views, ageHours }, cfg)) return "velocity";
  return null;
}

// --- CLI ---------------------------------------------------------------------
function arg(name, def = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=").slice(1).join("=");
  return process.argv.includes(`--${name}`) ? true : def;
}
// A bare `--flag` (no =value) makes arg() return true; coerce value-flags to strings so
// e.g. a bare `--handles` can never feed a boolean into .split() (it crashed before).
const argStr = (name, def = "") => { const v = arg(name, def); return v === true || v == null ? def : String(v); };

async function scrapeHandle(cdp, handle, cfg, seen, now, trackingCategory = null) {
  const h = normHandle(handle);
  const target = Number(cfg.scrapeTargetPerHandle ?? 36);
  // The grid is a SPA — tiles populate after navigation. It can also come back empty (header only)
  // when Instagram throttles rapid requests, so reload + back off a few times before concluding
  // a handle has no reels.
  let tiles = [];
  for (let attempt = 0; attempt < 3 && tiles.length === 0; attempt++) {
    await cdp.navigate(`https://www.instagram.com/${h}/reels/`);
    await wait(6000 + attempt * 4000);
    tiles = (await cdp.evaluate(GRID_EXPR)) || [];
    for (let r = 0; r < 5 && tiles.length === 0; r++) {
      await wait(2000);
      tiles = (await cdp.evaluate(GRID_EXPR)) || [];
    }
  }
  // Scroll to load more, stopping at the target or once the grid stops growing
  // (only treat "no growth" as done once we actually have tiles).
  for (let round = 0; round < 15; round++) {
    if (tiles.length >= target) break;
    const before = tiles.length;
    await cdp.evaluate("window.scrollBy(0, 2400)");
    await wait(2200);
    const next = (await cdp.evaluate(GRID_EXPR)) || [];
    if (next.length <= before && before > 0) break;
    tiles = next;
  }

  const followers = parseCount(await cdp.evaluate(FOLLOWERS_EXPR)) || null;
  // Header rendered (followers found) but grid empty => Instagram is withholding the grid (throttle),
  // NOT a creator with zero reels. Surface it so a run isn't silently treated as "no hits".
  const throttled = tiles.length === 0 && followers != null;
  const creatorMedianViews = median(tiles.map((t) => parseCount(t.viewsText)));

  const reels = [];
  for (const cand of candidateTiles(tiles, cfg)) {
    if (seen[cand.shortcode]) continue; // already processed in a past run
    // Per-reel try/catch: one bad og fetch must not discard the reels already collected for this handle.
    try {
      // og:description gives exact likes/comments/postedAt (+ enables the velocity age rule)
      await cdp.navigate(`https://www.instagram.com/reel/${cand.shortcode}/`);
      await wait(2500);
      const og = parseOgDescription(await cdp.evaluate(OG_EXPR));
      const ageHours = ageHoursFrom(og.postedAt, now);
      const reason = viralReasonFor({ views: cand.views, ageHours }, cfg);
      if (reason) {
        reels.push(buildWorklistItem({
          shortcode: cand.shortcode, views: cand.views, og, handle: h, followers, creatorMedianViews, viralReason: reason, trackingCategory, now,
        }));
      }
    } catch (e) {
      console.error(`\n    (reel ${cand.shortcode} failed: ${String(e.message || e).slice(0, 80)} — continuing)`);
    }
    await wait(1500); // pace reel fetches
  }
  return { handle: `@${h}`, followers, gridSize: tiles.length, throttled, reels };
}

async function main() {
  const outDir = "viral-radar-out";
  let niche = argStr("niche");
  if (!niche) {
    const cfgs = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith(".config.json")) : [];
    niche = cfgs[0] ? cfgs[0].replace(".config.json", "") : "ai-claude";
  }
  const cfgPath = path.join(outDir, `${niche}.config.json`);
  if (!fs.existsSync(cfgPath)) { console.error(`No config at ${cfgPath}.`); process.exit(1); }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

  const explicit = argStr("handles").split(",").map((s) => s.trim()).filter(Boolean);
  const scrapeList = resolveScrapeList(cfg, explicit); // [{ handle, trackingCategory }] — tracked + inspiration lanes
  if (!scrapeList.length) { console.error("No trackedHandles. Add some with /viral-competitor."); process.exit(1); }

  const seenPath = path.join(outDir, "cache", `${niche}-seen.json`);
  let seen = {};
  try { seen = JSON.parse(fs.readFileSync(seenPath, "utf8")); } catch {}

  const port = Number(argStr("port", "9222")) || 9222;
  let targets;
  try { targets = await listTargets(port); } catch {
    console.error(`\nCannot reach Chrome on :${port}. Launch it with --remote-debugging-port=${port} --remote-allow-origins=* and log into Instagram. See workflows/scrape-cdp.md.\n`);
    process.exit(1);
  }
  const target = pickPageTarget(targets);
  if (!target) { console.error("No usable Chrome page target found."); process.exit(1); }
  const cdp = await CdpClient.connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  const now = new Date();
  const gapMs = Number(argStr("gap", "4000")) || 4000; // pacing between handles — Instagram throttles bursts
  const perHandle = [];
  const allReels = [];
  for (let i = 0; i < scrapeList.length; i++) {
    const { handle, trackingCategory } = scrapeList[i];
    if (i > 0) await wait(gapMs);
    process.stdout.write(`  @${handle}${trackingCategory === "inspiration" ? " (inspiration)" : ""} … `);
    try {
      const r = await scrapeHandle(cdp, handle, cfg, seen, now, trackingCategory);
      perHandle.push({ handle: r.handle, trackingCategory, kept: r.reels.length, gridSize: r.gridSize, followers: r.followers, throttled: r.throttled });
      allReels.push(...r.reels);
      console.log(`${r.reels.length} new viral / ${r.gridSize} tiles${r.throttled ? " (throttled: header only)" : ""}`);
    } catch (e) {
      perHandle.push({ handle: `@${handle}`, trackingCategory, kept: 0, error: String(e.message || e) });
      console.log(`error: ${e.message || e}`);
    }
  }
  cdp.close();

  const minPerHandle = Number(cfg.minPerHandle ?? 5);
  const underFloor = perHandle.filter((p) => p.kept < minPerHandle).map((p) => p.handle);
  const throttledHandles = perHandle.filter((p) => p.throttled).map((p) => p.handle);
  const out = argStr("out", path.join(outDir, `worklist-${niche}.json`));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(out, JSON.stringify({
    niche, source: "cdp", scrapedAt: now.toISOString(), minPerHandle, perHandle, underFloor, throttledHandles, reels: allReels,
  }, null, 2));

  console.log(`\nWork-list: ${allReels.length} new viral reels across ${scrapeList.length} handles → ${out}`);
  if (underFloor.length) console.log(`Under ${minPerHandle}/handle: ${underFloor.join(", ")}`);
  if (throttledHandles.length) console.log(`⚠ ${throttledHandles.length} handle(s) returned header-only (Instagram throttling). Re-run later / increase --gap. Affected: ${throttledHandles.join(", ")}`);
  console.log("Next: feed this work-list into Step 3 enrichment (the agent reads it and continues the pipeline).");
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
