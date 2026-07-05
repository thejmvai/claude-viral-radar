// Telegram digest: after a radar run, push a compact digest to a phone via a Telegram bot.
// Dependency-free (Node global fetch). Optional + non-blocking: with no credentials it prints
// the digest and exits 0. Sends with parse_mode HTML (handles like @raul_the_rockstar break
// Markdown; HTML only needs & < > escaped). See workflows/telegram-digest.md.
//
// Reads TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID from (in order): process env,
// ./.claude/viral-radar.env, ~/.config/viral-radar/.env.
//
// CLI: node scripts/notify-telegram.mjs [--niche=ai-claude] [--dataset=<path>]
//        [--top=5] [--trends=3] [--min-per-handle=5] [--dry-run]
import dns from "node:dns";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// api.telegram.org publishes AAAA records; on machines with a broken IPv6 route Node's fetch
// resolves IPv6 first and dies with ETIMEDOUT "fetch failed" while curl (which falls back to
// IPv4) works. Prefer IPv4 — same effect as --dns-result-order=ipv4first, baked in.
dns.setDefaultResultOrder("ipv4first");

const TG_LIMIT = 4096;

// --- credential resolution (mirrors discover.mjs) ----------------------------
function parseEnvFile(p) {
  const out = {};
  try {
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if (m && !line.trimStart().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}
export function resolveTelegramCreds(env = process.env, cwd = process.cwd(), home = os.homedir()) {
  let token = env.TELEGRAM_BOT_TOKEN || "";
  let chatId = env.TELEGRAM_CHAT_ID || "";
  for (const p of [path.join(cwd, ".claude/viral-radar.env"), path.join(home, ".config/viral-radar/.env")]) {
    if (token && chatId) break;
    const f = parseEnvFile(p);
    token = token || f.TELEGRAM_BOT_TOKEN || "";
    chatId = chatId || f.TELEGRAM_CHAT_ID || "";
  }
  return { token, chatId };
}

// --- pure formatting helpers (unit-tested) -----------------------------------
export const escapeHtml = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, "&quot;");

// 500557 -> "501K"; 1234567 -> "1.2M"; 1.2e9 -> "1.2B"; 940 -> "940"
export function formatViews(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return "?";
  if (v >= 1e9) return (v / 1e9).toFixed(v >= 1e10 ? 0 : 1).replace(/\.0$/, "") + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(Math.round(v));
}

const link = (url, text) =>
  url ? `<a href="${escapeAttr(url)}">${escapeHtml(text)}</a>` : escapeHtml(text);

// Top reels by rankScore (desc), ties to newer post.
export function topReels(reels = [], n = 5) {
  return [...reels]
    .sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0) || new Date(b.postedAt || 0) - new Date(a.postedAt || 0))
    .slice(0, Math.max(0, n));
}

// Per-channel coverage: total counts + channels sorted by kept-reel count (desc).
export function buildCoverage(reels = []) {
  const by = new Map();
  for (const r of reels) by.set(r.handle, (by.get(r.handle) || 0) + 1);
  const perChannel = [...by.entries()]
    .map(([handle, count]) => ({ handle, count }))
    .sort((a, b) => b.count - a.count || a.handle.localeCompare(b.handle));
  return { channelCount: by.size, reelCount: reels.length, perChannel };
}

// Up to n cross-platform trend items (platform + title + url), falling back to themes.
export function topTrends(crossPlatform, n = 3) {
  if (!crossPlatform) return [];
  const out = [];
  for (const src of crossPlatform.sources || []) {
    for (const it of src.items || []) {
      out.push({ platform: src.platform || "", icon: src.icon || "", title: it.title || "", url: it.url || "" });
      if (out.length >= n) return out;
    }
  }
  if (!out.length) {
    for (const t of crossPlatform.themes || []) {
      out.push({ platform: "", icon: "", title: t, url: "" });
      if (out.length >= n) break;
    }
  }
  return out.slice(0, Math.max(0, n));
}

// Build the full HTML digest string from a ViralDataset.
export function formatDigest(dataset = {}, { top = 5, trends = 3, minPerHandle = 0, recs = 3 } = {}) {
  const label = dataset.label || dataset.niche || "niche";
  const date = String(dataset.generatedAt || "").slice(0, 10) || "—";
  // Inspiration-lane and off-topic reels are not niche signal — keep them out of the digest.
  const reels = (dataset.reels || []).filter((r) => r.trackingCategory !== "inspiration" && r.offTopic !== true);
  const lines = [`🛰️ <b>Viral Radar — ${escapeHtml(label)}</b>`, escapeHtml(date)];

  // Top reels
  lines.push("", `<b>Top ${Math.min(top, reels.length)} reels</b>`);
  if (!reels.length) {
    lines.push("No reels this run.");
  } else {
    topReels(reels, top).forEach((r, i) => {
      const views = formatViews(r.metrics && r.metrics.views);
      const hook = r.hook || r.shortcode || "(untitled)";
      lines.push(`${i + 1}. ${link(r.url, hook)}`);
      lines.push(`   ${escapeHtml(r.handle || "?")} · ${views} views · rank ${r.rankScore ?? "?"}`);
    });
  }

  // Coverage
  const cov = buildCoverage(reels);
  lines.push("", `<b>Coverage:</b> ${cov.channelCount} channels · ${cov.reelCount} reels`);
  const multi = cov.perChannel.filter((c) => c.count >= 2);
  const singles = cov.perChannel.length - multi.length;
  if (multi.length) {
    lines.push(multi.map((c) => `${escapeHtml(c.handle)} ×${c.count}`).join(", ") + (singles ? `, +${singles} more with 1` : ""));
  } else if (singles) {
    lines.push(`${singles} channels with 1 reel each`);
  }
  if (minPerHandle > 0) {
    const under = cov.perChannel.filter((c) => c.count < minPerHandle).map((c) => escapeHtml(c.handle));
    // Bound the callout: a long list is noise on a phone (most channels just don't have N hits).
    if (under.length && under.length <= 8) lines.push(`Under ${minPerHandle}/handle: ${under.join(", ")}`);
    else if (under.length) lines.push(`${under.length} channels under ${minPerHandle}/handle`);
  }

  // Hot across the niche
  const tr = topTrends(dataset.crossPlatform, trends);
  if (tr.length) {
    lines.push("", `🔥 <b>Hot across the niche</b>`);
    for (const t of tr) {
      const tag = t.icon ? `${t.icon} ` : t.platform ? `${escapeHtml(t.platform)}: ` : "• ";
      lines.push(`${tag}${link(t.url, t.title)}`);
    }
  }

  // Creator recommendations — surfaced only, NEVER auto-added (the user decides via /viral-competitor).
  const rex = (dataset.recommendations || []).slice(0, Math.max(0, recs));
  if (rex.length) {
    lines.push("", `🔎 <b>Consider tracking</b> (reply /viral-competitor to add)`);
    for (const c of rex) {
      const why = [c.relevantReels != null ? `${c.relevantReels} niche reels` : null, c.bestViews ? `best ${formatViews(c.bestViews)}` : null]
        .filter(Boolean).join(" · ");
      lines.push(`• ${link(c.profile, "@" + String(c.handle || "").replace(/^@/, ""))}${why ? ` — ${escapeHtml(why)}` : ""}`);
    }
  }

  return truncateForTelegram(lines.join("\n"));
}

// Telegram rejects HTML cut mid-tag ("can't parse entities" -> the whole send fails), so truncate at a
// line boundary — every digest line is self-contained HTML. Fall back to stripping a dangling tag only
// if the text is one giant line.
export function truncateForTelegram(text, limit = TG_LIMIT) {
  if (text.length <= limit) return text;
  const cut = text.lastIndexOf("\n", limit - 2);
  if (cut > 0) return text.slice(0, cut) + "\n…";
  return text.slice(0, limit - 1).replace(/<[^>]*$/, "") + "…";
}

// --- network -----------------------------------------------------------------
export async function sendTelegramMessage(
  { token, chatId, text, parseMode = "HTML", disablePreview = true },
  fetchImpl = fetch
) {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: disablePreview,
    }),
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!data.ok) {
    const why = data.description || `HTTP ${res.status}`;
    throw new Error(`Telegram sendMessage failed: ${why}`);
  }
  return data.result;
}

// --- CLI ---------------------------------------------------------------------
function arg(name, def = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=").slice(1).join("=");
  return process.argv.includes(`--${name}`) ? true : def;
}
// A bare `--flag` (no =value) makes arg() return true; coerce value-flags to strings.
const argStr = (name, def = "") => { const v = arg(name, def); return v === true || v == null ? def : String(v); };

async function main() {
  const outDir = "viral-radar-out";
  let niche = argStr("niche");
  if (!niche) {
    const cfgs = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith(".config.json")) : [];
    niche = cfgs[0] ? cfgs[0].replace(".config.json", "") : "ai-claude";
  }
  const dsPath = argStr("dataset", path.join(outDir, `${niche}.json`));
  if (!fs.existsSync(dsPath)) {
    console.error(`No dataset at ${dsPath}. Run /viral-radar first.`);
    process.exit(1);
  }
  const dataset = JSON.parse(fs.readFileSync(dsPath, "utf8"));

  // Config supplies the pretty label (datasets usually carry only the niche slug) and minPerHandle.
  let cfg = {};
  const cfgPath = path.join(outDir, `${niche}.config.json`);
  if (fs.existsSync(cfgPath)) { try { cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")); } catch {} }
  if (!dataset.label && cfg.label) dataset.label = cfg.label;
  const minPerHandle = Number(argStr("min-per-handle", "0")) || Number(cfg.minPerHandle) || 0;

  const text = formatDigest(dataset, {
    top: Number(argStr("top", "5")) || 5,
    trends: Number(argStr("trends", "3")) || 3,
    minPerHandle,
  });

  const { token, chatId } = resolveTelegramCreds();
  const dryRun = arg("dry-run") === true;

  if (dryRun || !token || !chatId) {
    console.log(text);
    if (!dryRun && (!token || !chatId)) {
      console.log("\n(No Telegram credentials found — digest not sent. Set TELEGRAM_BOT_TOKEN + " +
        "TELEGRAM_CHAT_ID in .claude/viral-radar.env to deliver to your phone. See guides/setup-telegram.md.)");
    }
    return;
  }

  const result = await sendTelegramMessage({ token, chatId, text });
  console.log(`Telegram digest sent (message_id ${result.message_id}) to chat ${chatId}.`);
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}
