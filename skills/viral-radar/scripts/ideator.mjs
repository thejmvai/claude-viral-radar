// Ideator: turn radar insight into reel ideas. This tool does the DETERMINISTIC parts — assemble the
// grounding pack the ideas must cite, and validate the ideas the agent writes (hook length, required
// fields, grounding ref, no em dashes). The creative generation itself is the agent's job, obeying
// voice.md. See workflows/ideator.md. GATE: ideas are his-voice content — draft for review, never auto-publish.
//
// CLI: node scripts/ideator.mjs <dataset.json>            -> print the grounding pack (JSON)
//      node scripts/ideator.mjs <dataset.json> <ideas.json> -> validate an ideas file
import fs from "node:fs";

export const hookWords = (hook) => String(hook || "").trim().split(/\s+/).filter(Boolean).length;
const DASHES = /[—–]/; // em AND en dash — both read as AI tells in his voice

// Assemble the evidence each idea must be grounded in: top on-niche reels, detected patterns, the
// "what's working" plays, and cross-platform trends. Inspiration-lane reels are excluded (format
// references, not niche signal).
export function buildIdeaContext(dataset = {}, { topN = 8 } = {}) {
  const onNiche = (dataset.reels || []).filter((r) => r.trackingCategory !== "inspiration");
  const topReels = [...onNiche]
    .sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0))
    .slice(0, topN)
    .map((r) => ({
      shortcode: r.shortcode,
      handle: r.handle,
      hook: r.hook || "",
      format: r.format || "",
      rankScore: r.rankScore ?? null,
      views: (r.metrics && r.metrics.views) || null,
      whyItWorks: r.whyItWorks || "",
    }));
  const ns = dataset.nicheSynthesis || {};
  const patterns = (ns.topPatterns || []).map((p) => ({ pattern: p.pattern, count: p.count }));
  const whatsWorking = ns.whatsWorking || [];
  const cp = dataset.crossPlatform || {};
  const trends = [];
  for (const s of cp.sources || []) for (const it of s.items || []) trends.push({ platform: s.platform || "", title: it.title || "" });
  if (!trends.length) for (const t of cp.themes || []) trends.push({ platform: "", title: t });
  return {
    niche: dataset.niche || "",
    label: dataset.label || dataset.niche || "",
    topReels,
    patterns,
    whatsWorking,
    trends: trends.slice(0, 8),
  };
}

// Validate the ideas the agent produced. Every idea needs a <=12-word hook, an angle, a format, and a
// grounding ref (so it cites a real radar/trend item, not a hallucination). Em dashes are banned (voice).
export function validateIdeas(ideas, { maxHookWords = 12 } = {}) {
  const errs = [];
  if (!Array.isArray(ideas)) return ["ideas is not an array"];
  if (!ideas.length) return ["ideas is empty"];
  ideas.forEach((idea, i) => {
    const w = `idea[${i}]`;
    if (!idea || typeof idea !== "object") { errs.push(`${w} is not an object`); return; }
    const hook = String(idea.hook || "").trim();
    if (!hook) errs.push(`${w} missing hook`);
    else if (hookWords(hook) > maxHookWords) errs.push(`${w} hook is ${hookWords(hook)} words (max ${maxHookWords})`);
    if (!String(idea.angle || "").trim()) errs.push(`${w} missing angle`);
    if (!String(idea.format || "").trim()) errs.push(`${w} missing format`);
    const g = idea.grounding;
    if (!g || !String(g.ref || "").trim()) errs.push(`${w} missing grounding.ref (every idea must cite a real radar/trend item)`);
    else if (g.type && !["reel", "trend", "pattern"].includes(g.type)) errs.push(`${w} grounding.type "${g.type}" invalid (reel|trend|pattern)`);
    // Check every field that renders in the report, not just hook/angle.
    for (const [fld, val] of [["hook", idea.hook], ["angle", idea.angle], ["format", idea.format], ["grounding.note", g && g.note]]) {
      if (DASHES.test(String(val || ""))) errs.push(`${w} ${fld} contains an em/en dash (banned in his voice)`);
    }
  });
  return errs;
}

// Remix (the Blort "rescript a winner" concept): the deterministic context pack for remixing ONE
// specific reel — its structural beats, hook mechanics, and why it worked — so the agent can rebuild
// the same skeleton around Jameson's topic in his voice. The agent writes; this only assembles evidence.
export function buildRemixContext(dataset = {}, shortcode) {
  const r = [...(dataset.reels || []), ...(dataset.offTopic || [])].find((x) => x.shortcode === shortcode);
  if (!r) return null;
  return {
    shortcode: r.shortcode,
    handle: r.handle,
    url: r.url,
    metrics: r.metrics || {},
    likeRate: r.likeRate ?? null,
    commentRate: r.commentRate ?? null,
    hook: r.hook || "",
    hookDelivery: r.hookDelivery || "",
    format: r.format || "",
    ctaType: r.ctaType || "",
    beats: (r.storyboard || []).map(({ timestamp, role, caption }) => ({ timestamp, role, caption })),
    transcriptExcerpt: String(r.transcript || "").slice(0, 1500),
    breakdown: r.breakdown || "",
    whyItWorks: r.whyItWorks || "",
    instruction:
      "Remix this reel for Jameson: keep the beat structure (same roles, same pacing) and the hook MECHANIC, " +
      "but swap the subject to his AI/Claude niche and write it strictly in his voice (voice.md: plain words, " +
      "his devices, no em dashes, no fabricated numbers). Output: hook (<= 12 words), beat-by-beat script, " +
      "on-screen text per beat, and a one-line note on what was kept from the original. DRAFT for review only.",
  };
}

// CLI: node ideator.mjs <dataset.json>                      -> grounding pack
//      node ideator.mjs <dataset.json> <ideas.json>          -> validate ideas
//      node ideator.mjs <dataset.json> --remix=<shortcode>   -> remix context pack for one reel
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const remixFlag = args.find((a) => a.startsWith("--remix="));
  const pos = args.filter((a) => !a.startsWith("--"));
  const [dsPath, ideasPath] = pos;
  if (!dsPath) { console.error("usage: node ideator.mjs <dataset.json> [ideas.json] [--remix=<shortcode>]"); process.exit(1); }
  const ds = JSON.parse(fs.readFileSync(dsPath, "utf8"));
  if (remixFlag) {
    const sc = remixFlag.split("=")[1];
    const ctx = buildRemixContext(ds, sc);
    if (!ctx) { console.error(`No reel ${sc} in the dataset.`); process.exit(1); }
    console.log(JSON.stringify(ctx, null, 2));
  } else if (ideasPath) {
    const ideas = JSON.parse(fs.readFileSync(ideasPath, "utf8")).ideas || [];
    const errs = validateIdeas(ideas);
    if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
    console.log(`OK — ${ideas.length} ideas valid`);
  } else {
    console.log(JSON.stringify(buildIdeaContext(ds), null, 2));
  }
}
