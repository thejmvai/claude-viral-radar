// Discovery: find NEW niche creators by hashtag (the thing tracked-handle scraping
// can't do). Searches Instagram Reels via the ScrapeCreators API, groups reels by
// creator, drops handles you already track, and ranks the rest by a blend of reach,
// niche presence, and recency (reusing the radar's own recencyScore).
//
// Reads SCRAPECREATORS_API_KEY from (in order): process env, ./.claude/last30days.env,
// ~/.config/last30days/.env. Free tier is 100 credits; ~1 per hashtag search.
//
// CLI: node scripts/discover.mjs [--niche=ai-claude] [--hashtags=a,b,c]
//        [--exclude=h1,h2] [--min-views=50000] [--per-tag=20] [--out=<path>]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recencyScore } from "./score.mjs";

const SC_BASE = "https://api.scrapecreators.com/v2/instagram/reels/search";
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const normHandle = (h) => String(h || "").trim().replace(/^@/, "").toLowerCase();

// --- key resolution ----------------------------------------------------------
function parseEnvFile(p) {
  const out = {};
  try {
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !line.trimStart().startsWith("#")) out[m[1]] = m[2];
    }
  } catch {}
  return out;
}
export function resolveKey(env = process.env, cwd = process.cwd(), home = os.homedir()) {
  if (env.SCRAPECREATORS_API_KEY) return env.SCRAPECREATORS_API_KEY;
  for (const p of [path.join(cwd, ".claude/last30days.env"), path.join(home, ".config/last30days/.env")]) {
    const v = parseEnvFile(p).SCRAPECREATORS_API_KEY;
    if (v) return v;
  }
  return "";
}

// --- pure parsing + ranking (unit-tested) ------------------------------------
export function parseReel(raw) {
  if (!raw || typeof raw !== "object") return null;
  const owner = raw.owner || raw.user || {};
  const handle = normHandle(typeof owner === "object" ? owner.username : owner);
  if (!handle) return null;
  const cap = raw.caption;
  const caption = typeof cap === "object" && cap ? cap.text || "" : cap || "";
  const ta = raw.taken_at;
  let date = "";
  if (typeof ta === "string") date = ta.slice(0, 10);
  else if (typeof ta === "number") date = new Date(ta * 1000).toISOString().slice(0, 10);
  return {
    id: String(raw.id || raw.pk || raw.shortcode || ""),
    shortcode: raw.shortcode || raw.code || "",
    url: raw.url || (raw.shortcode ? `https://www.instagram.com/reel/${raw.shortcode}/` : ""),
    caption,
    views: raw.video_play_count || raw.video_view_count || raw.play_count || 0,
    likes: raw.like_count || 0,
    comments: raw.comment_count || 0,
    handle,
    date,
  };
}

export function discoveryScore({ bestViews, count, latestDate }, { now = new Date(), halfLifeDays = 30 } = {}) {
  const views = clamp(Math.log10(Math.max(bestViews, 1)) / Math.log10(5_000_000), 0, 1); // 5M = full
  const presence = clamp(count / 3, 0, 1); // 3+ niche reels = full
  const rec = recencyScore(latestDate, now, halfLifeDays);
  return Math.round(100 * (0.55 * views + 0.25 * presence + 0.2 * rec));
}

// Group deduped reels by creator, drop excluded/known handles, rank the rest.
export function aggregateCreators(reels, { exclude = [], minViews = 50000, now = new Date(), halfLifeDays = 30 } = {}) {
  const excl = new Set(exclude.map(normHandle));
  const seen = new Set();
  const by = new Map();
  for (const r of reels) {
    if (!r || !r.handle || excl.has(r.handle)) continue;
    if (r.id && seen.has(r.id)) continue;
    if (r.id) seen.add(r.id);
    if (!by.has(r.handle)) by.set(r.handle, []);
    by.get(r.handle).push(r);
  }
  const creators = [];
  for (const [handle, rs] of by) {
    const best = rs.reduce((a, b) => (b.views > a.views ? b : a), rs[0]);
    if (best.views < minViews) continue;
    const latestDate = rs.map((r) => r.date).filter(Boolean).sort().at(-1) || "";
    const stats = { bestViews: best.views, count: rs.length, latestDate };
    creators.push({
      handle,
      profile: `https://www.instagram.com/${handle}/`,
      nicheReels: rs.length,
      bestViews: best.views,
      totalViews: rs.reduce((s, r) => s + r.views, 0),
      latestDate,
      bestReel: { url: best.url, views: best.views, likes: best.likes, caption: best.caption.slice(0, 120), date: best.date },
      score: discoveryScore(stats, { now, halfLifeDays }),
    });
  }
  creators.sort((a, b) => b.score - a.score || b.bestViews - a.bestViews);
  return creators;
}

// --- network ----------------------------------------------------------------
async function searchHashtag(tag, key, { attempts = 3 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${SC_BASE}?query=${encodeURIComponent(tag)}`, { headers: { "x-api-key": key } });
      const data = await res.json();
      if (data && data.success) return { reels: data.reels || [], credits: data.credits_remaining };
    } catch {}
  }
  return { reels: [], credits: null };
}

// --- CLI --------------------------------------------------------------------
function arg(name, def = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : def;
}

async function main() {
  const cwd = process.cwd();
  const outDir = "viral-radar-out";
  // niche + config
  let niche = arg("niche");
  if (!niche) {
    const cfgs = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith(".config.json")) : [];
    niche = cfgs[0] ? cfgs[0].replace(".config.json", "") : "ai-claude";
  }
  let cfg = {};
  const cfgPath = path.join(outDir, `${niche}.config.json`);
  if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

  const hashtags = (arg("hashtags") || (cfg.seedHashtags || []).join(",") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!hashtags.length) {
    console.error("No hashtags. Pass --hashtags=a,b,c or set seedHashtags in the config.");
    process.exit(1);
  }
  const minViews = Number(arg("min-views", cfg.discoveryMinViews ?? cfg.velocityThreshold ?? 50000));

  // exclude = tracked + inspiration handles + handles already in the dataset
  // (inspiration handles are out-of-niche on purpose — never surface them as niche discovery)
  const exclude = new Set([...(cfg.trackedHandles || []), ...(cfg.inspirationHandles || [])].map(normHandle));
  const dsPath = path.join(outDir, `${niche}.json`);
  if (fs.existsSync(dsPath)) {
    try {
      const ds = JSON.parse(fs.readFileSync(dsPath, "utf8"));
      for (const r of [...(ds.reels || []), ...(ds.quarantined || [])]) exclude.add(normHandle(r.handle));
    } catch {}
  }
  for (const h of (arg("exclude") || "").split(",")) if (h.trim()) exclude.add(normHandle(h));

  const key = resolveKey();
  if (!key) {
    console.error("No SCRAPECREATORS_API_KEY found (env, ./.claude/last30days.env, or ~/.config/last30days/.env).");
    console.error("Get a free key at https://app.scrapecreators.com");
    process.exit(1);
  }

  console.log(`Discovery for niche "${niche}": searching #${hashtags.join(", #")} (excluding ${exclude.size} known handles)`);
  const all = [];
  let credits = null;
  for (const tag of hashtags) {
    const { reels, credits: c } = await searchHashtag(tag, key);
    if (c != null) credits = c;
    const parsed = reels.map(parseReel).filter(Boolean);
    console.log(`  #${tag}: ${parsed.length} reels`);
    all.push(...parsed);
  }

  const creators = aggregateCreators(all, { exclude: [...exclude], minViews });
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = arg("out", path.join(outDir, `discovery-${niche}.json`));
  fs.writeFileSync(outPath, JSON.stringify({ niche, generatedAt: new Date().toISOString(), minViews, hashtags, creators }, null, 2));

  console.log(`\nNew creators worth tracking (>= ${minViews.toLocaleString()} views), ${creators.length} found. Credits left: ${credits ?? "?"}\n`);
  const top = creators.slice(0, 15);
  for (const c of top) {
    console.log(`  ${String(c.score).padStart(3)} @${c.handle.padEnd(22)} ${String(c.bestViews).padStart(10)} best · ${c.nicheReels} reel(s) · ${c.bestReel.caption.slice(0, 40)}`);
  }
  if (top.length) {
    console.log(`\nAdd the best with:\n  /viral-competitor ${top.slice(0, 8).map((c) => "@" + c.handle).join(" ")}`);
  }
  console.log(`\nFull list: ${outPath}`);
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
