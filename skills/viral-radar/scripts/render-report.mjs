import fs from "node:fs";
import path from "node:path";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n).toLocaleString("en-US");
const compactNum = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e9) return (v / 1e9).toFixed(v >= 1e10 ? 0 : 1).replace(/\.0$/, "") + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "K";
  return String(v);
};

// Human "x days ago" label from a postedAt date, relative to `now`.
function ageLabel(postedAt, now = new Date()) {
  if (!postedAt) return "";
  const days = Math.floor((now.getTime() - new Date(postedAt).getTime()) / 8.64e7);
  if (!Number.isFinite(days) || days < 0) return "";
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const m = Math.floor(days / 30);
  return m === 1 ? "1mo ago" : `${m}mo ago`;
}

function chip(svg, text, cls = "") {
  return `<span class="chip ${cls}">${svg}${esc(text)}</span>`;
}
const EYE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>';
const HEART = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.35-9.5-8.5C.5 9 2 5.5 5.5 5.5c2 0 3.5 1.5 6.5 4 3-2.5 4.5-4 6.5-4 3.5 0 5 3.5 3 7C19 16.65 12 21 12 21z"/></svg>';
const FIRE = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 3-2 4.2-2 7 0 1 .6 2 1.6 2.5C12 10 13 8 13 6c2 2.2 4 4.2 4 7a5 5 0 1 1-10 0c0-3.2 3-5.4 5-11z"/></svg>';
const CMT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z"/></svg>';
const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const BOLT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>';

function reelCard(r, framesBaseUrl, resolveFrame) {
  // Defensive: a single partial reel (failed enrichment) must not kill the whole report render.
  const mt = r.metrics || {};
  const sb = r.storyboard || [];
  const frameUrl = (f) => (typeof resolveFrame === "function" ? resolveFrame(f.frame) : `${framesBaseUrl}${esc(f.frame)}`);
  const frames = sb
    .map((f, n) => `<img class="frm${n === 0 ? " on" : ""}" src="${frameUrl(f)}" data-role="${esc(f.role || "")}" data-ts="${esc(f.timestamp || "")}" data-cap="${esc(f.caption || "")}" alt="storyboard frame">`)
    .join("");
  const navBtns = sb.length > 1 ? `<button class="nav prev" aria-label="previous frame"><span class="chev">&#10094;</span></button><button class="nav next" aria-label="next frame"><span class="chev">&#10095;</span></button>` : "";
  const dots = sb.length > 1 ? `<div class="dots">${sb.map((f, n) => `<i class="${n === 0 ? "on" : ""}" title="${esc(f.role || "")}"></i>`).join("")}</div>` : "";
  const stepHint = sb.length > 1 ? `<div class="stephint">${sb.map((f) => esc(f.role || "")).filter(Boolean).join(" &rarr; ")}</div>` : "";
  // 0/1/2s hook frames (the literal first seconds), shown above the hook line when captured.
  const hf = r.hookFrames || [];
  const hookStrip = hf.length
    ? `<div class="hookframes">${hf.slice(0, 3).map((f, i) => `<figure><img src="${frameUrl({ frame: f })}" alt="first ${i}s"><figcaption>${i}s</figcaption></figure>`).join("")}</div>`
    : "";
  return `
  <div class="reel">
    <div class="left">
      <div class="rank">#${r.rank}</div>
      <div class="stage">${frames}<span class="role"></span><span class="ts"></span><span class="fcount">1 / ${sb.length || 1}</span>${navBtns}${dots}</div>
      ${stepHint}
      <div class="cap"><b class="cr"></b> <span class="cc"></span></div>
      <a class="igbtn" href="${esc(r.url)}" target="_blank" rel="noopener">Open on Instagram <span class="ic">&#8599;</span></a>
    </div>
    <div class="right">
      <div class="who"><h2>${esc(r.handle)}</h2><span class="pill-reel">REEL</span>${r.trackingCategory === "inspiration" ? '<span class="pill-inspo">INSPIRATION &middot; FORMAT</span>' : ""}</div>
      <div class="chips">
        ${chip(EYE, fmt(mt.views ?? 0), "eye")}
        ${chip(HEART, fmt(mt.likes ?? 0), "heart")}
        ${chip(FIRE, `${r.breakout ?? 0}× breakout`, "hot")}
        ${chip(CMT, fmt(mt.comments ?? 0), "cmt")}
        ${chip(CLOCK, [esc(r.postedAt), ageLabel(r.postedAt)].filter(Boolean).join(" · "), "date")}
        ${r.rankScore != null ? chip(BOLT, `${r.rankScore} rank · ${r.signalScore} signal`, "score") : ""}
      </div>
      <div class="qrow">
        <span><b>${((r.likeRate || 0) * 100).toFixed(1)}%</b> like-rate <span class="organic">${r.ctaType === "organic" ? "organic" : "CTA-gated"}</span></span>
        <span><b>${((r.commentRate || 0) * 100).toFixed(1)}%</b> comment-rate</span>
      </div>
      <div class="sec"><div class="seclabel">Hook &middot; ${esc(String(r.hookDelivery || "").replace("+", " + "))}</div>${hookStrip}<div class="hook">&ldquo;${esc(r.hook)}&rdquo;</div></div>
      <div class="sec"><div class="seclabel">Format</div><span class="ftag">${esc(r.format)}</span></div>
      <div class="sec"><div class="seclabel">Breakdown</div><div class="breakdown">${esc(r.breakdown)}</div></div>
      <details class="tx"><summary><span class="lft"><span class="tri">&#9656;</span> Transcript</span><button class="copybtn">Copy</button></summary><div class="tx-body">${esc(r.transcript).replace(/\n/g, "<br>")}</div></details>
      <div class="why"><div class="seclabel">Why it worked</div><p>${esc(r.whyItWorks)}</p></div>
    </div>
  </div>`;
}

// Optional "Hot across the niche" section: cross-platform trends gathered from
// last30days (Reddit, TikTok, YouTube, GitHub, ...). Rendered only if ds.crossPlatform exists.
function crossPlatformSection(ds) {
  const cp = ds.crossPlatform;
  if (!cp || !Array.isArray(cp.sources) || !cp.sources.length) return "";
  const themes = (cp.themes || []).map((t) => `<li>${esc(t)}</li>`).join("");
  const blocks = cp.sources.map((s) => {
    const items = (s.items || []).map((it) =>
      `<li><a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.title)}</a>${it.metric ? ` <span class="tmetric">${esc(it.metric)}</span>` : ""}</li>`).join("");
    return `<div class="tsrc"><div class="tsrc-h">${esc(s.icon || "")} ${esc(s.platform)}</div><ul>${items}</ul></div>`;
  }).join("");
  return `<div class="trends">
    <div class="thead"><h2>Hot across the niche</h2><span class="twin">${esc(cp.window || "last 30 days")}</span></div>
    ${cp.summary ? `<div class="tsummary">${esc(cp.summary)}</div>` : ""}
    ${themes ? `<div class="seclabel">What's trending</div><ul class="tthemes">${themes}</ul>` : ""}
    <div class="tgrid">${blocks}</div>
    <div class="tnote">Niche-wide chatter pulled from public platforms (competitor reels are above; this is what everyone else is talking about).</div>
  </div>`;
}

// At-a-glance stat row above the tabs: reels, gate-pass %, channels, top views, discovered, transcribed.
function statBar(ds) {
  const reels = (ds.reels || []).filter((r) => r.trackingCategory !== "inspiration");
  const quar = ds.quarantined || [];
  const caught = reels.length + quar.length;
  const pct = caught ? Math.round((100 * reels.length) / caught) : 100;
  const channels = new Set(reels.map((r) => r.handle)).size;
  const topViews = reels.reduce((m, r) => Math.max(m, (r.metrics && r.metrics.views) || 0), 0);
  const discovered = reels.filter((r) => r.discoveredVia === "discovery").length;
  const transcribed = reels.filter((r) => r.transcript && String(r.transcript).trim()).length;
  const cell = (n, l) => `<div class="stat"><div class="statn">${n}</div><div class="statl">${l}</div></div>`;
  return `<div class="statbar">${[
    cell(fmt(reels.length), "reels"),
    cell(`${pct}%`, "passed gate"),
    cell(fmt(channels), "channels"),
    cell(compactNum(topViews), "top views"),
    cell(fmt(discovered), "discovered"),
    cell(fmt(transcribed), "transcribed"),
  ].join("")}</div>`;
}

// "Radar picks": discovery's recommended creators — surfaced for a human decision, never auto-added.
function recommendationsBlock(recs) {
  if (!recs || !recs.length) return "";
  const rows = recs.map((c) => {
    const h = esc(String(c.handle || "").replace(/^@/, ""));
    const why = [c.relevantReels != null ? `${c.relevantReels} niche reels` : "", c.bestViews ? `best ${compactNum(c.bestViews)} views` : ""].filter(Boolean).join(" · ");
    return `<li><a href="${esc(c.profile || `https://www.instagram.com/${h}/`)}" target="_blank" rel="noopener">@${h}</a>${why ? ` <span class="tmetric">${esc(why)}</span>` : ""}${c.reason ? ` — ${esc(c.reason)}` : ""}</li>`;
  }).join("");
  return `<div class="tsrc recs"><div class="tsrc-h">🔎 Radar picks — consider tracking (add with /viral-competitor; never auto-added)</div><ul>${rows}</ul></div>`;
}

// Optional "📊 Analytics" tab from ds.analytics (built by scripts/analytics.mjs).
function analyticsSection(a) {
  if (!a || !a.onNicheCount) return "";
  const t = (rows, cols) => `<table class="atable"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  const fmts = t(a.formats.slice(0, 10).map((f) =>
    `<tr><td>${esc(f.format)}</td><td>${f.count}</td><td>${compactNum(f.medianViews)}</td><td>${f.avgSignal}</td><td>${Math.round(f.gateShare * 100)}%</td></tr>`).join(""),
    ["Format", "Reels", "Median views", "Avg signal", "Gated"]);
  const creators = t(a.creators.slice(0, 15).map((c) =>
    `<tr><td>${esc(c.handle)}</td><td>${c.reels}</td><td>${compactNum(c.medianViews)}</td><td>${c.avgSignal}</td><td>${c.avgBreakout}×</td><td>${esc(c.bestFormat)}</td></tr>`).join(""),
    ["Creator", "Reels", "Median views", "Avg signal", "Breakout", "Best format"]);
  const dur = t(a.duration.map((d) => `<tr><td>${esc(d.bucket)}</td><td>${d.count}</td><td>${compactNum(d.medianViews)}</td></tr>`).join(""), ["Length", "Reels", "Median views"]);
  const cta = a.cta ? `<div class="qrow" style="margin:8px 0 20px"><span><b>${compactNum(a.cta.organic.medianViews)}</b> median views organic (${a.cta.organic.count})</span><span><b>${compactNum(a.cta.gated.medianViews)}</b> median views gated (${a.cta.gated.count})</span></div>` : "";
  const hooks = a.hooks ? `<div class="qrow" style="margin:8px 0 20px"><span><b>${a.hooks.avgWords}</b> avg hook words</span><span><b>${Math.round(a.hooks.questionShare * 100)}%</b> question hooks</span><span><b>${Math.round(a.hooks.spokenShare * 100)}%</b> spoken hooks</span></div>` : "";
  return `<div class="offnote">Computed over the ${a.onNicheCount} on-niche reels (inspiration + off-topic excluded) by scripts/analytics.mjs.</div>
    <div class="seclabel">Format leaderboard</div>${fmts}
    <div class="seclabel" style="margin-top:22px">Gate vs organic</div>${cta}
    <div class="seclabel">Duration sweet spot</div>${dur}
    <div class="seclabel" style="margin-top:22px">Creator scorecards</div>${creators}
    ${hooks ? `<div class="seclabel" style="margin-top:22px">Hooks</div>${hooks}` : ""}`;
}

// Optional "Ideas" tab: on-voice reel ideas from the Ideator, each grounded in a real radar/trend item.
function ideasSection(ideas) {
  if (!ideas || !ideas.length) return "";
  const note = `<div class="offnote">Reel ideas from the Ideator &mdash; in Jameson's voice, each grounded in a real reel / trend / pattern from the radar. A draft for review, not auto-published.</div>`;
  const cards = ideas.map((it, i) => {
    const g = it.grounding || {};
    const gtxt = g.ref ? `${esc(g.type || "ref")}: ${esc(g.ref)}${g.note ? ` &middot; ${esc(g.note)}` : ""}` : "";
    return `<div class="idea">
      <div class="idea-h"><span class="idea-n">${String(i + 1).padStart(2, "0")}</span>${it.format ? `<span class="ftag">${esc(it.format)}</span>` : ""}</div>
      <div class="idea-hook">&ldquo;${esc(it.hook)}&rdquo;</div>
      <div class="idea-angle">${esc(it.angle)}</div>
      ${gtxt ? `<div class="idea-ground">${gtxt}</div>` : ""}
    </div>`;
  }).join("");
  return `${note}<div class="ideas">${cards}</div>`;
}

export function renderReport(ds, { framesBaseUrl = "", resolveFrame } = {}) {
  const ns = ds.nicheSynthesis || {};
  const allReels = ds.reels || [];
  const quarList = ds.quarantined || [];
  const plays = (ns.whatsWorking || []).map((p, i) => `<div class="play"><b>0${i + 1}</b><span>${esc(p)}</span></div>`).join("");
  // Split the inspiration lane out of the main ranking — its own tab, renumbered per lane, kept out of the
  // niche ranking/digest. Inspiration reels stay in ds.reels (tagged trackingCategory:"inspiration").
  const isInspo = (r) => r.trackingCategory === "inspiration";
  const mainReels = allReels.filter((r) => !isInspo(r)).map((r, i) => ({ ...r, rank: i + 1 }));
  const inspoReels = allReels.filter(isInspo).map((r, i) => ({ ...r, rank: i + 1 }));
  const hasInspo = inspoReels.length > 0;
  const cards = mainReels.map((r) => reelCard(r, framesBaseUrl, resolveFrame)).join("\n");
  const inspoCards = inspoReels.map((r) => reelCard(r, framesBaseUrl, resolveFrame)).join("\n");
  const inspoNote = `<div class="offnote">Inspiration lane &mdash; out-of-niche creators tracked for hook/format craft, not niche signal. Kept out of the main ranking, synthesis, and digest.</div>`;
  const quar = quarList.length
    ? `<div class="quarantine"><div class="seclabel">Boosted / low-signal, excluded from lessons</div>${quarList.map((r) => `<div class="qline">${esc(r.handle)} &middot; ${fmt((r.metrics || {}).views ?? 0)} views &middot; <b>${((r.likeRate || 0) * 100).toFixed(3)}%</b> like-rate</div>`).join("")}</div>`
    : "";
  const offTopicList = ds.offTopic || [];
  const offT = offTopicList.length
    ? `<div class="quarantine"><div class="seclabel">Off-topic (viral, but not niche signal &mdash; kept out of ranking + lessons)</div>${offTopicList.map((r) => `<div class="qline">${esc(r.handle)} &middot; ${fmt((r.metrics || {}).views ?? 0)} views &middot; ${esc(r.hook || r.shortcode || "")}${r.nicheRelevance ? ` &middot; <b>${r.nicheRelevance.hits} niche hits</b>` : ""}</div>`).join("")}</div>`
    : "";
  const channels = new Set(mainReels.map((r) => r.handle)).size;
  const sub = `${mainReels.length} reels &middot; ${channels} channels &middot; sorted by recency-weighted signal`;
  const ideas = ds.ideas || [];
  const hasIdeas = ideas.length > 0;
  const recs = ds.recommendations || [];
  const hasRecs = recs.length > 0;
  const an = ds.analytics;
  const hasAnalytics = !!(an && an.onNicheCount);
  const cp = ds.crossPlatform;
  const hasCP = !!(cp && Array.isArray(cp.sources) && cp.sources.length);
  const othersCount = (hasCP ? cp.sources.reduce((s, x) => s + (x.items || []).length, 0) : 0) + recs.length;
  let mainBody;
  if (hasIdeas || hasInspo || hasCP || hasRecs || hasAnalytics) {
    const tabDefs = [{ k: "reels", label: "&#128241; Instagram Reels", n: mainReels.length }];
    if (hasAnalytics) tabDefs.push({ k: "analytics", label: "&#128202; Analytics", n: an.onNicheCount });
    if (hasIdeas) tabDefs.push({ k: "ideas", label: "&#128161; Ideas", n: ideas.length });
    if (hasInspo) tabDefs.push({ k: "inspo", label: "&#10024; Inspiration", n: inspoReels.length });
    if (hasCP || hasRecs) tabDefs.push({ k: "others", label: "&#127760; Others", n: othersCount });
    const tabBar = `<div class="tabs">${tabDefs.map((t, i) => `<button class="tab${i === 0 ? " on" : ""}" data-tab="${t.k}">${t.label} <span class="tcount">${t.n}</span></button>`).join("")}</div>`;
    const panel = (k, inner, on) => `<div class="tabpanel${on ? "" : " hidden"}" data-panel="${k}">${inner}</div>`;
    let panels = panel("reels", `${cards}\n${quar}\n${offT}`, true);
    if (hasAnalytics) panels += panel("analytics", analyticsSection(an), false);
    if (hasIdeas) panels += panel("ideas", ideasSection(ideas), false);
    if (hasInspo) panels += panel("inspo", `${inspoNote}\n${inspoCards}`, false);
    if (hasCP || hasRecs) panels += panel("others", `${recommendationsBlock(recs)}\n${crossPlatformSection(ds)}`, false);
    mainBody = `${tabBar}${panels}`;
  } else {
    mainBody = `${cards}\n${recommendationsBlock(recs)}\n${crossPlatformSection(ds)}\n${quar}\n${offT}`;
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Viral Radar — ${esc(ds.niche)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${REPORT_CSS}</style></head>
<body><div class="wrap"><div class="pglabel">Viral Radar &middot; ${esc(ds.label || ds.niche)}</div><div class="pgsub">${sub}</div>
${statBar(ds)}
<div class="synth"><h2>Top replicable plays</h2><div class="plays">${plays}</div><div class="gatenote">${esc(ns.summary || "")}</div></div>
${mainBody}
</div>
<script>
document.querySelectorAll(".copybtn").forEach(function(b){b.addEventListener("click",function(e){e.preventDefault();var d=b.closest("details");var body=d?d.querySelector(".tx-body"):null;navigator.clipboard.writeText(body?body.innerText:"");var t=b.textContent;b.textContent="Copied";setTimeout(function(){b.textContent=t;},1500);});});
document.querySelectorAll(".reel").forEach(function(reel){
  var stage=reel.querySelector(".stage"); if(!stage) return;
  var imgs=stage.querySelectorAll(".frm"); if(!imgs.length) return;
  var roleEl=stage.querySelector(".role"), tsEl=stage.querySelector(".ts"), cntEl=stage.querySelector(".fcount");
  var dotsEl=stage.querySelectorAll(".dots i");
  var crEl=reel.querySelector(".cap .cr"), ccEl=reel.querySelector(".cap .cc"), i=0;
  function show(n){ i=(n+imgs.length)%imgs.length;
    imgs.forEach(function(im,k){im.classList.toggle("on",k===i);});
    dotsEl.forEach(function(d,k){d.classList.toggle("on",k===i);});
    var a=imgs[i];
    if(roleEl) roleEl.textContent=a.dataset.role||"";
    if(tsEl) tsEl.textContent=a.dataset.ts||"";
    if(cntEl) cntEl.textContent=(i+1)+" / "+imgs.length;
    if(crEl) crEl.textContent=a.dataset.role||"";
    if(ccEl) ccEl.textContent=a.dataset.cap||"";
  }
  var p=stage.querySelector(".nav.prev"), nx=stage.querySelector(".nav.next");
  if(p) p.addEventListener("click",function(){show(i-1);});
  if(nx) nx.addEventListener("click",function(){show(i+1);});
  show(0);
});
document.querySelectorAll(".tab").forEach(function(t){t.addEventListener("click",function(){var name=t.getAttribute("data-tab");document.querySelectorAll(".tab").forEach(function(x){x.classList.toggle("on",x===t);});document.querySelectorAll(".tabpanel").forEach(function(p){p.classList.toggle("hidden",p.getAttribute("data-panel")!==name);});});});
</script>
</body></html>`;
}

const REPORT_CSS = `
:root{--bg:#0C0C10;--card:#141419;--card-2:#1C1C23;--border:#2A2A33;--text:#F3F3F6;--muted:#9A9AA4;--faint:#6C6C77;--red:#FF4D6A;--red-bg:rgba(255,77,106,.12);--red-bd:rgba(255,77,106,.38);--fire:#FF7A3C;--heart:#FF5A7A;--amber:#F0B73E;--green:#46C178;--sans:'Geist',system-ui,sans-serif;--mono:'Geist Mono',ui-monospace,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);font-size:15px;line-height:1.6}
.wrap{max-width:1120px;margin:0 auto;padding:46px 40px 90px}.pglabel{font-size:12px;font-weight:600;letter-spacing:.05em;color:var(--red);text-transform:uppercase;margin-bottom:6px}.pgsub{font-family:var(--mono);font-size:12px;color:var(--faint);margin-bottom:24px}
.statbar{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:0 0 30px;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:18px 22px}
.stat{text-align:center}.statn{font-family:var(--mono);font-size:23px;font-weight:700;color:var(--text);line-height:1.1}.statl{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--faint);margin-top:5px}
.hookframes{display:flex;gap:8px;margin:0 0 14px}.hookframes figure{margin:0;flex:1}.hookframes img{width:100%;aspect-ratio:9/16;object-fit:cover;border-radius:9px;border:1px solid var(--border);display:block}.hookframes figcaption{font-family:var(--mono);font-size:10px;color:var(--faint);text-align:center;margin-top:4px}
.synth{margin-bottom:30px}.synth h2{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);margin:0 0 14px}
.plays{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.play b{display:block;font-family:var(--mono);color:var(--red);font-size:14px;margin-bottom:6px}.play span{font-size:14.5px}.gatenote{margin-top:18px;color:var(--muted);font-size:13.5px}
.reel{background:var(--card);border:1px solid var(--border);border-radius:22px;padding:30px 34px;display:grid;grid-template-columns:300px 1fr;gap:42px;align-items:start;margin-bottom:22px}
.rank{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;font-family:var(--mono);font-weight:700;color:#fff;background:linear-gradient(140deg,#FF9A5A,#FF4D6A);margin-bottom:16px}
.stage{position:relative;border-radius:16px;overflow:hidden;aspect-ratio:9/16;background:#000;user-select:none}.stage .frm{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none}.stage .frm.on{display:block}
.role{position:absolute;left:10px;top:10px;font-size:11px;font-weight:600;color:#fff;background:rgba(255,77,106,.92);padding:2px 9px;border-radius:7px;z-index:2}.ts{position:absolute;left:10px;bottom:10px;font-family:var(--mono);font-size:11px;color:#fff;background:rgba(0,0,0,.6);padding:2px 8px;border-radius:7px;z-index:2}
.nav{position:absolute;top:0;height:100%;width:50%;border:0;background:transparent;cursor:pointer;z-index:3;display:flex;align-items:center;opacity:.92;transition:opacity .15s}.nav.prev{left:0;justify-content:flex-start;padding-left:8px}.nav.next{right:0;justify-content:flex-end;padding-right:8px}.nav:hover{opacity:1}
.nav .chev{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;font-size:14px;line-height:1;box-shadow:0 1px 5px rgba(0,0,0,.45)}.nav:hover .chev{background:rgba(255,77,106,.95);transform:scale(1.08)}.nav.next .chev{animation:nudge 1.8s ease-in-out infinite}
@keyframes nudge{0%,100%{transform:translateX(0)}50%{transform:translateX(3px)}}
.dots{position:absolute;left:0;right:0;bottom:10px;display:flex;gap:5px;justify-content:center;z-index:4;pointer-events:none}.dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.5);transition:all .15s}.dots i.on{background:#fff;width:16px;border-radius:3px}
.stephint{margin:8px 2px 0;font-family:var(--mono);font-size:10.5px;letter-spacing:.02em;color:var(--faint);text-align:center;text-transform:uppercase}
.fcount{position:absolute;right:10px;top:10px;font-family:var(--mono);font-size:11px;color:#fff;background:rgba(0,0,0,.6);padding:3px 9px;border-radius:8px;z-index:2}
.cap{font-size:12px;color:var(--muted);text-align:center;margin-top:11px}.cap b{color:var(--red)}
.igbtn{display:flex;align-items:center;justify-content:center;gap:10px;margin:14px auto 0;width:100%;background:var(--card-2);color:var(--text);border:1px solid var(--border);border-radius:999px;padding:9px 18px;font-size:13px;text-decoration:none}.igbtn .ic{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#fff;background:radial-gradient(circle at 30% 107%,#fce6a4,#f06748 44%,#cc3d92 60%,#4a64d8 92%)}
.who{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}.who h2{font-size:24px;font-weight:600;margin:0}.pill-reel{font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--red);border:1px solid var(--red-bd);background:var(--red-bg);border-radius:7px;padding:3px 9px}
.pill-inspo{font-size:11px;font-weight:600;letter-spacing:.08em;color:#B69CFF;border:1px solid rgba(150,120,255,.42);background:rgba(150,120,255,.13);border-radius:7px;padding:3px 9px}
.chips{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:8px}.chip{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:13px;background:var(--card-2);border:1px solid var(--border);border-radius:9px;padding:6px 12px}.chip svg{width:14px;height:14px}.chip.eye svg{color:var(--muted)}.chip.heart svg{color:var(--heart)}.chip.cmt svg{color:var(--muted)}.chip.date{color:var(--muted)}.chip.date svg{color:var(--faint)}.chip.score{background:rgba(70,193,120,.10);border-color:rgba(70,193,120,.40);color:#7FE0A6;font-weight:600}.chip.score svg{color:var(--green)}.chip.hot{background:var(--red-bg);border-color:var(--red-bd);color:#FF8E62;font-weight:600}.chip.hot svg{color:var(--fire)}
.qrow{font-size:12.5px;color:var(--faint);margin-bottom:24px;display:flex;gap:18px;flex-wrap:wrap}.qrow b{font-family:var(--mono);color:var(--muted)}.qrow .organic{color:var(--green)}
.sec{margin-top:22px}.seclabel{font-size:11px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--faint);margin-bottom:9px}.hook{font-size:23px;font-weight:600;line-height:1.3}.ftag{display:inline-block;font-size:13.5px;font-weight:600;color:var(--amber);background:rgba(240,183,62,.08);border:1px solid rgba(240,183,62,.42);border-radius:10px;padding:7px 16px}.breakdown{font-size:15px;color:var(--muted);line-height:1.7}
details.tx{margin-top:22px;border:1px solid var(--border);border-radius:12px;background:var(--card-2)}details.tx summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:13px 16px}details.tx summary::-webkit-details-marker{display:none}.lft{display:flex;align-items:center;gap:9px;font-size:12px;font-weight:600;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}.copybtn{font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text);background:#27272F;border:1px solid var(--border);border-radius:7px;padding:5px 12px;cursor:pointer}.tx-body{font-size:14.5px;line-height:1.85;color:var(--muted);padding:0 16px 16px}
.why{margin-top:22px;background:var(--red-bg);border:1px solid var(--red-bd);border-radius:14px;padding:16px 20px}.why .seclabel{color:var(--red)}.why p{margin:0;font-size:15px;line-height:1.7;color:#E7C9D0}
.quarantine{margin-top:30px;border-top:1px solid var(--border);padding-top:18px}.qline{font-size:13px;color:var(--muted);margin-top:6px}.qline b{font-family:var(--mono);color:var(--fire)}
.trends{margin-top:44px;border-top:1px solid var(--border);padding-top:30px}
.thead{display:flex;align-items:baseline;gap:14px;margin-bottom:6px}.thead h2{font-size:22px;font-weight:600;margin:0}.twin{font-family:var(--mono);font-size:12px;color:var(--faint)}
.tsummary{color:var(--muted);font-size:14.5px;margin:8px 0 18px;line-height:1.7}
.tthemes{margin:8px 0 24px;padding-left:18px}.tthemes li{margin:5px 0;font-size:14.5px}
.tgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}
.tsrc{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:18px 20px}.tsrc-h{font-family:var(--mono);font-weight:600;font-size:12.5px;color:var(--red);margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em}
.tsrc ul{margin:0;padding-left:16px}.tsrc li{margin:8px 0;font-size:14px;line-height:1.5}.tsrc a{color:var(--text);text-decoration:none;border-bottom:1px solid var(--border)}.tsrc a:hover{color:var(--red);border-color:var(--red-bd)}
.tmetric{font-family:var(--mono);font-size:11.5px;color:var(--faint)}
.tnote{margin-top:18px;color:var(--faint);font-size:12.5px}
@media(max-width:780px){.tgrid{grid-template-columns:1fr}.statbar{grid-template-columns:repeat(3,1fr);gap:16px}}
@media print{.tsrc{break-inside:avoid}.trends{break-inside:avoid}}
.tabs{display:flex;gap:6px;margin:4px 0 26px;border-bottom:1px solid var(--border)}
.tab{appearance:none;background:transparent;border:0;border-bottom:2px solid transparent;color:var(--muted);font-family:var(--sans);font-size:14px;font-weight:600;padding:10px 14px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;margin-bottom:-1px}
.tab:hover{color:var(--text)}.tab.on{color:var(--text);border-bottom-color:var(--red)}
.tab .tcount{font-family:var(--mono);font-size:11px;color:var(--faint);background:var(--card-2);border:1px solid var(--border);border-radius:7px;padding:1px 7px}.tab.on .tcount{color:var(--red);border-color:var(--red-bd)}
.tabpanel.hidden{display:none}.trends{margin-top:8px;border-top:0;padding-top:0}
.offnote{margin:2px 0 22px;padding:12px 16px;background:var(--card-2);border:1px solid var(--border);border-left:3px solid #9678FF;border-radius:10px;color:var(--muted);font-size:13.5px;line-height:1.6}
.atable{width:100%;border-collapse:collapse;font-size:13.5px}.atable th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--faint);text-align:left;padding:6px 10px;border-bottom:1px solid var(--border)}.atable td{padding:7px 10px;border-bottom:1px solid var(--border);color:var(--muted)}.atable td:first-child{color:var(--text)}.atable tr:last-child td{border-bottom:0}
.tsrc.recs{margin-bottom:22px;border-left:3px solid var(--green)}
.ideas{display:grid;gap:16px}.idea{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px 24px}.idea-h{display:flex;align-items:center;gap:12px;margin-bottom:12px}.idea-n{font-family:var(--mono);font-weight:700;color:var(--red);font-size:14px}.idea-hook{font-size:20px;font-weight:600;line-height:1.3;margin-bottom:10px}.idea-angle{color:var(--muted);font-size:14.5px;line-height:1.6}.idea-ground{margin-top:12px;font-family:var(--mono);font-size:11.5px;color:var(--faint);border-top:1px solid var(--border);padding-top:10px}
@media print{.tabs{display:none}.tabpanel.hidden{display:block!important}.trends{margin-top:44px;border-top:1px solid var(--border);padding-top:30px}}
@media(max-width:780px){.reel{grid-template-columns:1fr}.plays{grid-template-columns:1fr}}
/* Print / PDF export: show ALL storyboard frames as a filmstrip and expand transcripts */
@media print{
  .stage{aspect-ratio:auto;height:auto;background:transparent;display:flex;gap:4px}
  .stage .frm{position:static;display:block;width:24%;height:auto;aspect-ratio:9/16;border-radius:7px}
  .role,.ts,.nav,.fcount,.dots{display:none!important}
  details.tx>*:not(summary){display:block!important}
  details.tx summary .copybtn,details.tx summary .tri{display:none}
  .reel{break-inside:avoid;page-break-inside:avoid}
}`;

// CLI: node render-report.mjs <dataset.json> <out.html> [--frames-base=<prefix>]
// --frames-base: prefix for the frames/... img paths. Reports at viral-radar-out/ root need "" (the
// default); DATE-ARCHIVED reports live two levels deeper, so they need --frames-base=../../frames/
// (with the dataset's "frames/..." paths, pass the prefix ending at the parent of frames/: "../../").
// Every render is followed by an automatic asset check (check-report.mjs) — a report with broken
// image refs fails loudly (exit 2) instead of shipping dead photos.
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const pos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const fbFlag = process.argv.find((a) => a.startsWith("--frames-base="));
  // Dataset frame paths already start with "frames/", so the base is everything BEFORE that.
  const framesBaseUrl = fbFlag ? fbFlag.split("=").slice(1).join("=").replace(/frames\/?$/, "") : "";
  const [dsPath, outPath] = pos;
  if (!dsPath || !outPath) { console.error("usage: node render-report.mjs <dataset.json> <out.html> [--frames-base=../../]"); process.exit(1); }
  const ds = JSON.parse(fs.readFileSync(dsPath, "utf8"));
  fs.writeFileSync(outPath, renderReport(ds, { framesBaseUrl }));
  console.log(`wrote ${outPath}`);
  const { verifyReportAssets, formatCheck } = await import("./check-report.mjs");
  const res = verifyReportAssets(fs.readFileSync(outPath, "utf8"), path.dirname(path.resolve(outPath)));
  console.log(formatCheck(res, outPath));
  if (res.missing.length) process.exit(2);
}
