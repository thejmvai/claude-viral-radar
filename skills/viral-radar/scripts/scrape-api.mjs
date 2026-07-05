// Paid Step 2 detection over the ScrapeCreators API (the fast alternative to chrome scraping).
// Instagram soft-blocks rapid browser scraping (see workflows/scrape-cdp.md); this path pulls each
// tracked handle's reels straight from the ScrapeCreators `user/reels` endpoint instead — no browser,
// no IG throttle, exact engagement metrics. It writes the SAME work-list shape scrape-cdp.mjs produces
// (reusing buildWorklistItem), so Step 3 enrichment consumes it unchanged.
//
// PAID: every handle costs ScrapeCreators credits. Flag spend before running live (see CLAUDE.md).
// Reads SCRAPECREATORS_API_KEY via discover.mjs's resolveKey (env, ./.claude/last30days.env,
// ~/.config/last30days/.env).
//
// CLI: node scripts/scrape-api.mjs [--niche=ai-claude] [--handles=a,b] [--target=36] [--out=<path>]
import fs from "node:fs";
import path from "node:path";
import { resolveKey, normHandle } from "./discover.mjs";
import { buildWorklistItem, resolveScrapeList, median, viralReasonFor } from "./scrape-cdp.mjs";
import { ageHoursFrom } from "./score.mjs";

// LIVE-GATED: endpoint path + query params are confirmed only against the live ScrapeCreators API
// (per-handle `user/reels`, /v1, the stable endpoint per CLAUDE.md). Validate on the first paid call;
// if the shape differs, fix the constant + parseUserReelsResponse here and note the working shape below.
const SC_USER_REELS = "https://api.scrapecreators.com/v1/instagram/user/reels";

const num = (v) => (Number.isFinite(Number(v)) && v != null && v !== "" ? Number(v) : null);

// --- pure parsing (unit-tested) ----------------------------------------------
// One raw ScrapeCreators reel -> the minimal fields buildWorklistItem needs. Unlike discover.parseReel
// this does NOT require a per-reel owner (user/reels returns one creator's reels, so the handle comes
// from the query, not each item). Tolerates the common SC wrappers ({media}/{node}) and field aliases.
export function parseUserReel(raw) {
  const r = (raw && (raw.media || raw.node)) || raw;
  if (!r || typeof r !== "object") return null;
  const shortcode = r.shortcode || r.code || "";
  if (!shortcode) return null;
  const ta = r.taken_at ?? r.taken_at_timestamp ?? r.device_timestamp ?? r.taken_at_date;
  let date = "";
  if (typeof ta === "string") date = ta.slice(0, 10);
  else if (typeof ta === "number") date = new Date(ta > 1e12 ? ta : ta * 1000).toISOString().slice(0, 10);
  const cap = r.caption;
  const caption = typeof cap === "object" && cap ? cap.text || "" : cap || "";
  return {
    shortcode,
    url: r.url || `https://www.instagram.com/reel/${shortcode}/`,
    views: num(r.play_count) ?? num(r.video_play_count) ?? num(r.video_view_count) ?? num(r.view_count) ?? 0,
    likes: num(r.like_count) ?? num(r.likes) ?? 0,
    comments: num(r.comment_count) ?? num(r.comments) ?? 0,
    date,
    caption,
  };
}

// A ScrapeCreators user/reels response -> { followers, reels: [parseUserReel...] }. Defensive about the
// exact envelope (reels|items|data.reels, follower count on user|user_info|top level).
export function parseUserReelsResponse(data) {
  if (!data || typeof data !== "object") return { followers: null, reels: [] };
  const rawReels = data.reels || data.items || (data.data && (data.data.reels || data.data.items)) || [];
  const reels = rawReels.map(parseUserReel).filter(Boolean);
  const user = data.user || data.user_info || (data.data && data.data.user) || {};
  const followers =
    num(user.follower_count) ?? num(user.followers) ?? num(user.followers_count) ?? num(data.follower_count) ?? null;
  return { followers, reels };
}

// --- pure work-list build (unit-tested) --------------------------------------
// Parsed reels for ONE handle -> work-list items, applying the same candidate floor (velocityThreshold),
// seen-cache diff, and viral gate (viralReasonFor) as the chrome path, then buildWorklistItem for an
// identical shape. trackingCategory stamps the inspiration lane.
export function buildHandleWorklist({ handle, reels = [], followers = null, cfg = {}, seen = {}, now = new Date(), trackingCategory = null }) {
  const h = normHandle(handle);
  const creatorMedianViews = median(reels.map((r) => r.views));
  const floor = cfg.velocityThreshold ?? 50000;
  const out = [];
  for (const r of reels) {
    if (!r || !r.shortcode) continue;
    if (r.views < floor) continue; // below the candidate floor — never viral
    if (seen[r.shortcode]) continue; // already processed in a past run
    const ageHours = ageHoursFrom(r.date || null, now);
    const reason = viralReasonFor({ views: r.views, ageHours }, cfg);
    if (!reason) continue;
    out.push(buildWorklistItem({
      shortcode: r.shortcode,
      views: r.views,
      og: { likes: r.likes, comments: r.comments, postedAt: r.date || null },
      handle: h, followers, creatorMedianViews, viralReason: reason, trackingCategory, now,
    }));
  }
  return { handle: `@${h}`, followers: followers ?? null, fetched: reels.length, reels: out };
}

// --- network (live-gated shape; retry/error logic unit-tested via fetchImpl) --
// Backs off between attempts (the SC endpoints 429/500 under bursts) and keeps the LAST error so an
// out-of-credits / bad-handle failure prints as itself instead of masquerading as "0 reels".
export async function fetchUserReels(handle, key, { amount = 36, attempts = 3, fetchImpl = fetch, waitMs = 800 } = {}) {
  const url = `${SC_USER_REELS}?handle=${encodeURIComponent(handle)}&amount=${amount}`;
  let error = null;
  for (let i = 0; i < attempts; i++) {
    if (i) await new Promise((r) => setTimeout(r, waitMs * i));
    try {
      const res = await fetchImpl(url, { headers: { "x-api-key": key } });
      const data = await res.json();
      if (data && data.success !== false) return { data, credits: data.credits_remaining ?? null, error: null };
      error = (data && (data.message || data.error)) || `HTTP ${res.status}`;
    } catch (e) { error = String(e.message || e); }
  }
  return { data: null, credits: null, error };
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
  const scrapeList = resolveScrapeList(cfg, explicit); // tracked + inspiration lanes, category-tagged
  if (!scrapeList.length) { console.error("No trackedHandles. Add some with /viral-competitor."); process.exit(1); }

  const seenPath = path.join(outDir, "cache", `${niche}-seen.json`);
  let seen = {};
  try { seen = JSON.parse(fs.readFileSync(seenPath, "utf8")); } catch {}

  const key = resolveKey();
  if (!key) {
    console.error("No SCRAPECREATORS_API_KEY found (env, ./.claude/last30days.env, or ~/.config/last30days/.env).");
    console.error("Get a key at https://app.scrapecreators.com, or use the free chrome path: node scripts/scrape-cdp.mjs");
    process.exit(1);
  }

  const target = Number(argStr("target")) || Number(cfg.scrapeTargetPerHandle ?? 36);
  const now = new Date();
  const perHandle = [];
  const allReels = [];
  let credits = null;
  for (const { handle, trackingCategory } of scrapeList) {
    process.stdout.write(`  @${handle}${trackingCategory === "inspiration" ? " (inspiration)" : ""} … `);
    const { data, credits: c, error } = await fetchUserReels(handle, key, { amount: target });
    if (c != null) credits = c;
    if (!data) { const why = error || "fetch failed"; perHandle.push({ handle: `@${handle}`, trackingCategory, kept: 0, error: why }); console.log(`error: ${why}`); continue; }
    const { followers, reels } = parseUserReelsResponse(data);
    const r = buildHandleWorklist({ handle, reels, followers, cfg, seen, now, trackingCategory });
    perHandle.push({ handle: r.handle, trackingCategory, kept: r.reels.length, fetched: r.fetched, followers: r.followers });
    allReels.push(...r.reels);
    console.log(`${r.reels.length} new viral / ${r.fetched} reels`);
  }

  const minPerHandle = Number(cfg.minPerHandle ?? 5);
  const underFloor = perHandle.filter((p) => (p.kept ?? 0) < minPerHandle).map((p) => p.handle);
  const out = argStr("out", path.join(outDir, `worklist-${niche}.json`));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(out, JSON.stringify({
    niche, source: "scrapecreators", scrapedAt: now.toISOString(), creditsRemaining: credits,
    minPerHandle, perHandle, underFloor, reels: allReels,
  }, null, 2));

  console.log(`\nWork-list: ${allReels.length} new viral reels across ${scrapeList.length} handles → ${out}`);
  if (underFloor.length) console.log(`Under ${minPerHandle}/handle: ${underFloor.join(", ")}`);
  if (credits != null) console.log(`ScrapeCreators credits remaining: ${credits}`);
  console.log("Next: feed this work-list into Step 3 enrichment (the agent reads it and continues the pipeline).");
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
