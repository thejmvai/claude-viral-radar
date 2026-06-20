import fs from "node:fs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n).toLocaleString("en-US");
const compactNum = (n) => {
  const v = Number(n) || 0;
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
  const sb = r.storyboard || [];
  const frameUrl = (f) => (typeof resolveFrame === "function" ? resolveFrame(f.frame) : `${framesBaseUrl}${esc(f.frame)}`);
  const frames = sb
    .map((f, n) => `<img class="frm${n === 0 ? " on" : ""}" src="${frameUrl(f)}" data-role="${esc(f.role || "")}" data-ts="${esc(f.timestamp || "")}" data-cap="${esc(f.caption || "")}" alt="storyboard frame">`)
    .join("");
  const navBtns = sb.length > 1 ? `<button class="nav prev" aria-label="previous frame"></button><button class="nav next" aria-label="next frame"></button>` : "";
  // 0/1/2s hook frames (the literal first seconds), shown above the hook line when captured.
  const hf = r.hookFrames || [];
  const hookStrip = hf.length
    ? `<div class="hookframes">${hf.slice(0, 3).map((f, i) => `<figure><img src="${frameUrl({ frame: f })}" alt="first ${i}s"><figcaption>${i}s</figcaption></figure>`).join("")}</div>`
    : "";
  return `
  <div class="reel">
    <div class="left">
      <div class="rank">#${r.rank}</div>
      <div class="stage">${frames}<span class="role"></span><span class="ts"></span><span class="fcount">1 / ${sb.length || 1}</span>${navBtns}</div>
      <div class="cap"><b class="cr"></b> <span class="cc"></span></div>
      <a class="igbtn" href="${esc(r.url)}" target="_blank" rel="noopener">Open on Instagram <span class="ic">&#8599;</span></a>
    </div>
    <div class="right">
      <div class="who"><h2>${esc(r.handle)}</h2><span class="pill-reel">REEL</span></div>
      <div class="chips">
        ${chip(EYE, fmt(r.metrics.views), "eye")}
        ${chip(HEART, fmt(r.metrics.likes), "heart")}
        ${chip(FIRE, `${r.breakout}× breakout`, "hot")}
        ${chip(CMT, fmt(r.metrics.comments), "cmt")}
        ${chip(CLOCK, [esc(r.postedAt), ageLabel(r.postedAt)].filter(Boolean).join(" · "), "date")}
        ${r.rankScore != null ? chip(BOLT, `${r.rankScore} rank · ${r.signalScore} signal`, "score") : ""}
      </div>
      <div class="qrow">
        <span><b>${(r.likeRate * 100).toFixed(1)}%</b> like-rate <span class="organic">${r.ctaType === "organic" ? "organic" : "CTA-gated"}</span></span>
        <span><b>${(r.commentRate * 100).toFixed(1)}%</b> comment-rate</span>
      </div>
      <div class="sec"><div class="seclabel">Hook &middot; ${esc(r.hookDelivery.replace("+", " + "))}</div>${hookStrip}<div class="hook">&ldquo;${esc(r.hook)}&rdquo;</div></div>
      <div class="sec"><div class="seclabel">Format</div><span class="ftag">${esc(r.format)}</span></div>
      <div class="sec"><div class="seclabel">Breakdown</div><div class="breakdown">${esc(r.breakdown)}</div></div>
      <details class="tx"><summary><span class="lft"><span class="tri">&#9656;</span> Transcript</span><button class="copybtn" data-tx="${esc(r.transcript)}">Copy</button></summary><div class="tx-body">${esc(r.transcript).replace(/\n/g, "<br>")}</div></details>
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
  const reels = ds.reels || [];
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

export function renderReport(ds, { framesBaseUrl = "", resolveFrame } = {}) {
  const plays = ds.nicheSynthesis.whatsWorking.map((p, i) => `<div class="play"><b>0${i + 1}</b><span>${esc(p)}</span></div>`).join("");
  const cards = ds.reels.map((r) => reelCard(r, framesBaseUrl, resolveFrame)).join("\n");
  const quar = ds.quarantined.length
    ? `<div class="quarantine"><div class="seclabel">Boosted / low-signal, excluded from lessons</div>${ds.quarantined.map((r) => `<div class="qline">${esc(r.handle)} &middot; ${fmt(r.metrics.views)} views &middot; <b>${(r.likeRate * 100).toFixed(3)}%</b> like-rate</div>`).join("")}</div>`
    : "";
  const channels = new Set(ds.reels.map((r) => r.handle)).size;
  const sub = `${ds.reels.length} reels &middot; ${channels} channels &middot; sorted by recency-weighted signal`;
  const offNiche = ds.offNiche || [];
  const hasOff = offNiche.length > 0;
  const offCards = offNiche.map((r) => reelCard(r, framesBaseUrl, resolveFrame)).join("\n");
  const offNote = `<div class="offnote">Off-niche reference accounts &mdash; tracked for viral mechanics, not niche signal. Kept out of the main ranking and the digest.</div>`;
  const cp = ds.crossPlatform;
  const hasCP = !!(cp && Array.isArray(cp.sources) && cp.sources.length);
  const othersCount = hasCP ? cp.sources.reduce((s, x) => s + (x.items || []).length, 0) : 0;
  let mainBody;
  if (hasOff || hasCP) {
    const tabDefs = [{ k: "reels", label: "&#128241; Instagram Reels", n: ds.reels.length }];
    if (hasOff) tabDefs.push({ k: "offniche", label: "&#129694; Off-niche", n: offNiche.length });
    if (hasCP) tabDefs.push({ k: "others", label: "&#127760; Others", n: othersCount });
    const tabBar = `<div class="tabs">${tabDefs.map((t, i) => `<button class="tab${i === 0 ? " on" : ""}" data-tab="${t.k}">${t.label} <span class="tcount">${t.n}</span></button>`).join("")}</div>`;
    const panel = (k, inner, on) => `<div class="tabpanel${on ? "" : " hidden"}" data-panel="${k}">${inner}</div>`;
    let panels = panel("reels", `${cards}\n${quar}`, true);
    if (hasOff) panels += panel("offniche", `${offNote}\n${offCards}`, false);
    if (hasCP) panels += panel("others", crossPlatformSection(ds), false);
    mainBody = `${tabBar}${panels}`;
  } else {
    mainBody = `${cards}\n${crossPlatformSection(ds)}\n${quar}`;
  }
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Viral Radar — ${esc(ds.niche)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>${REPORT_CSS}</style></head>
<body><div class="wrap"><div class="pglabel">Viral Radar &middot; ${esc(ds.label || ds.niche)}</div><div class="pgsub">${sub}</div>
${statBar(ds)}
<div class="synth"><h2>Top replicable plays</h2><div class="plays">${plays}</div><div class="gatenote">${esc(ds.nicheSynthesis.summary)}</div></div>
${mainBody}
</div>
<script>
document.querySelectorAll(".copybtn").forEach(function(b){b.addEventListener("click",function(e){e.preventDefault();navigator.clipboard.writeText(b.getAttribute("data-tx")||"");var t=b.textContent;b.textContent="Copied";setTimeout(function(){b.textContent=t;},1500);});});
document.querySelectorAll(".reel").forEach(function(reel){
  var stage=reel.querySelector(".stage"); if(!stage) return;
  var imgs=stage.querySelectorAll(".frm"); if(!imgs.length) return;
  var roleEl=stage.querySelector(".role"), tsEl=stage.querySelector(".ts"), cntEl=stage.querySelector(".fcount");
  var crEl=reel.querySelector(".cap .cr"), ccEl=reel.querySelector(".cap .cc"), i=0;
  function show(n){ i=(n+imgs.length)%imgs.length;
    imgs.forEach(function(im,k){im.classList.toggle("on",k===i);});
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
.nav{position:absolute;top:0;height:100%;width:50%;border:0;background:transparent;cursor:pointer;z-index:3}.nav.prev{left:0}.nav.next{right:0}
.fcount{position:absolute;right:10px;top:10px;font-family:var(--mono);font-size:11px;color:#fff;background:rgba(0,0,0,.6);padding:3px 9px;border-radius:8px;z-index:2}
.cap{font-size:12px;color:var(--muted);text-align:center;margin-top:11px}.cap b{color:var(--red)}
.igbtn{display:flex;align-items:center;justify-content:center;gap:10px;margin:14px auto 0;width:100%;background:var(--card-2);color:var(--text);border:1px solid var(--border);border-radius:999px;padding:9px 18px;font-size:13px;text-decoration:none}.igbtn .ic{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#fff;background:radial-gradient(circle at 30% 107%,#fce6a4,#f06748 44%,#cc3d92 60%,#4a64d8 92%)}
.who{display:flex;align-items:center;gap:12px;margin-bottom:16px}.who h2{font-size:24px;font-weight:600;margin:0}.pill-reel{font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--red);border:1px solid var(--red-bd);background:var(--red-bg);border-radius:7px;padding:3px 9px}
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
.offnote{margin:2px 0 22px;padding:12px 16px;background:var(--card-2);border:1px solid var(--border);border-left:3px solid var(--amber);border-radius:10px;color:var(--muted);font-size:13.5px;line-height:1.6}
@media print{.tabs{display:none}.tabpanel.hidden{display:block!important}.trends{margin-top:44px;border-top:1px solid var(--border);padding-top:30px}}
@media(max-width:780px){.reel{grid-template-columns:1fr}.plays{grid-template-columns:1fr}}
/* Print / PDF export: show ALL storyboard frames as a filmstrip and expand transcripts */
@media print{
  .stage{aspect-ratio:auto;height:auto;background:transparent;display:flex;gap:4px}
  .stage .frm{position:static;display:block;width:24%;height:auto;aspect-ratio:9/16;border-radius:7px}
  .role,.ts,.nav,.fcount{display:none!important}
  details.tx>*:not(summary){display:block!important}
  details.tx summary .copybtn,details.tx summary .tri{display:none}
  .reel{break-inside:avoid;page-break-inside:avoid}
}`;

// CLI: node render-report.mjs <dataset.json> <out.html>
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [dsPath, outPath] = process.argv.slice(2);
  const ds = JSON.parse(fs.readFileSync(dsPath, "utf8"));
  fs.writeFileSync(outPath, renderReport(ds, { framesBaseUrl: "" }));
  console.log(`wrote ${outPath}`);
}
