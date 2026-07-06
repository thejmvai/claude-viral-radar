// Swipe-file renderer for /viral-saved. Consumes a swipe dataset (saved reels enriched with breakdowns)
// and emits a dark, self-contained HTML report tuned for a HAND-CURATED library — not competitor intel:
//   - leads with the cross-reel synthesis + replicable plays (the actual payoff)
//   - groups reels by hook ARCHETYPE (hookType), not by a virality rank
//   - shows engagement as context, drops signalScore/breakout/quarantine (meaningless on your own saves)
// Frame paths are relative ("frames/<sc>/..") and resolve against the report's own directory.
// Verifies every local image ref after writing; exits 2 if any is missing (never ship dead photos).
//
// CLI: node render-swipe.mjs <dataset.json> <out.html>

import fs from "node:fs";
import path from "node:path";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const compact = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(v);
};
const dur = (s) => { s = Number(s) || 0; const m = Math.floor(s / 60), ss = String(s % 60).padStart(2, "0"); return `${m}:${ss}`; };

function reelCard(r) {
  const m = r.metrics || {};
  const hook = (r.hookFrames || []).filter(Boolean);
  const sb = (r.storyboard || []).filter((f) => f && f.frame);
  const chips = [
    r.format && `<span class="chip">${esc(r.format)}</span>`,
    r.hookDelivery && `<span class="chip alt">${esc(r.hookDelivery)}</span>`,
    m.durationSec ? `<span class="chip q">⏱ ${dur(m.durationSec)}</span>` : "",
    m.likes ? `<span class="chip q">♥ ${compact(m.likes)}</span>` : "",
    m.comments ? `<span class="chip q">💬 ${compact(m.comments)}</span>` : "",
  ].filter(Boolean).join("");
  const hookStrip = hook.length
    ? `<div class="strip hookstrip">${hook.slice(0, 3).map((f, i) => `<figure><img loading="lazy" src="${esc(f)}" alt="hook ${i}s"><figcaption>${i}s</figcaption></figure>`).join("")}</div>` : "";
  const sbStrip = sb.length
    ? `<div class="strip">${sb.map((f) => `<figure><img loading="lazy" src="${esc(f.frame)}" alt="${esc(f.role || "")}" title="${esc(f.caption || "")}"><figcaption>${esc(f.timestamp || "")} · ${esc(f.role || "")}</figcaption></figure>`).join("")}</div>` : "";
  const tx = (r.transcript || "").trim();
  return `<article class="reel${r.partial ? " partial" : ""}">
    <div class="rhead">
      <a class="handle" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.handle)}</a>
      ${r.partial ? '<span class="chip warn">partial — no video</span>' : ""}
    </div>
    <p class="hook">${esc(r.hook || "")}</p>
    <div class="chips">${chips}</div>
    ${hookStrip}
    ${sbStrip}
    ${r.breakdown ? `<div class="blk"><h4>Structure</h4><p>${esc(r.breakdown)}</p></div>` : ""}
    ${r.whyItWorks ? `<div class="blk why"><h4>Why it works</h4><p>${esc(r.whyItWorks)}</p></div>` : ""}
    ${tx ? `<details class="tx"><summary>Transcript</summary><p>${esc(tx)}</p></details>` : ""}
  </article>`;
}

export function renderSwipe(ds) {
  const reels = (ds.reels || []).filter(Boolean);
  // group by hookType (archetype); largest groups first, ungrouped last
  const groups = {};
  for (const r of reels) { const k = r.hookType || "Other"; (groups[k] ||= []).push(r); }
  const ordered = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  const plays = (ds.plays || []).map((p) => `<li>${esc(p)}</li>`).join("");
  const sections = ordered.map(([name, rs]) => `
    <section class="grp">
      <h2>${esc(name)} <span class="ct">${rs.length}</span></h2>
      <div class="reels">${rs.map(reelCard).join("")}</div>
    </section>`).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ds.label || "Saved Reels — Swipe File")}</title>
<style>
:root{--bg:#0b0d10;--panel:#14181d;--panel2:#1b2026;--ink:#e8edf2;--dim:#93a1b0;--line:#252c34;--accent:#5eead4;--why:#fbbf24}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:32px 20px 80px}
header h1{font-size:26px;margin:0 0 4px;letter-spacing:-.02em}
header .meta{color:var(--dim);font-size:13px}
.pat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin:24px 0 8px}
.pat h2{margin:0 0 10px;font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:var(--accent)}
.pat p{margin:0 0 14px;color:#cdd6df}
.pat ol{margin:0;padding-left:20px}.pat li{margin:6px 0;color:#dbe3ea}
.grp{margin:34px 0 0}
.grp>h2{font-size:18px;margin:0 0 14px;border-bottom:1px solid var(--line);padding-bottom:8px}
.grp>h2 .ct{color:var(--dim);font-weight:400;font-size:14px}
.reels{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
.reel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
.reel.partial{opacity:.7}
.rhead{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.handle{color:var(--accent);text-decoration:none;font-weight:600;font-size:14px}
.handle:hover{text-decoration:underline}
.hook{font-size:16px;font-weight:600;margin:2px 0 10px;line-height:1.35}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.chip{background:var(--panel2);border:1px solid var(--line);border-radius:20px;padding:3px 10px;font-size:12px;color:#c7d0d8}
.chip.alt{color:#a5b4fc}.chip.q{color:var(--dim)}.chip.warn{color:#fca5a5;border-color:#5b2b2b}
.strip{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:12px}
.strip figure{margin:0;flex:0 0 auto;width:88px}
.hookstrip figure{width:76px}
.strip img{width:100%;border-radius:7px;border:1px solid var(--line);display:block;aspect-ratio:9/16;object-fit:cover}
.strip figcaption{font-size:10px;color:var(--dim);margin-top:3px;text-align:center;white-space:nowrap}
.blk{margin:10px 0}.blk h4{margin:0 0 3px;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--dim)}
.blk p{margin:0;font-size:14px;color:#d6dee6}
.blk.why h4{color:var(--why)}
.tx{margin-top:10px;border-top:1px solid var(--line);padding-top:8px}
.tx summary{cursor:pointer;font-size:12px;color:var(--dim)}
.tx p{font-size:13px;color:#aeb9c4;margin:8px 0 0;white-space:pre-wrap}
a{color:var(--accent)}
@media(max-width:520px){.reels{grid-template-columns:1fr}}
</style></head>
<body><div class="wrap">
<header>
  <h1>${esc(ds.label || "Saved Reels — Swipe File")}</h1>
  <div class="meta">${reels.length} saved reels · ${esc(ds.generatedAt || "")}${ds.scrapedFrom ? " · " + esc(ds.scrapedFrom) : ""}</div>
</header>
${ds.synthesis || plays ? `<div class="pat">
  <h2>Patterns in what you save</h2>
  ${ds.synthesis ? `<p>${esc(ds.synthesis)}</p>` : ""}
  ${plays ? `<ol>${plays}</ol>` : ""}
</div>` : ""}
${sections}
</div></body></html>`;
}

// --- broken-ref self-check ---------------------------------------------------
function verifyRefs(html, baseDir) {
  const srcs = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:|^data:/.test(s));
  const missing = srcs.filter((s) => !fs.existsSync(path.join(baseDir, decodeURIComponent(s))));
  return { total: srcs.length, missing };
}

// CLI
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [dsPath, outPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!dsPath || !outPath) { console.error("usage: node render-swipe.mjs <dataset.json> <out.html>"); process.exit(1); }
  const ds = JSON.parse(fs.readFileSync(dsPath, "utf8"));
  const html = renderSwipe(ds);
  fs.writeFileSync(outPath, html);
  const { total, missing } = verifyRefs(html, path.dirname(path.resolve(outPath)));
  console.log(`wrote ${outPath} — ${total - missing.length}/${total} local image refs resolve`);
  if (missing.length) { console.error(`✗ ${missing.length} MISSING refs:\n  ${missing.slice(0, 10).join("\n  ")}`); process.exit(2); }
  console.log("✓ all image refs resolve");
}
