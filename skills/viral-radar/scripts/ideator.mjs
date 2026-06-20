// Ideator: turn radar insight into reel ideas. This tool does the DETERMINISTIC parts — assemble the
// grounding pack the ideas must cite, and validate the ideas the agent writes (hook length, required
// fields, grounding ref, no em dashes). The creative generation itself is the agent's job, obeying
// voice.md. See workflows/ideator.md. GATE: ideas are his-voice content — draft for review, never auto-publish.
//
// CLI: node scripts/ideator.mjs <dataset.json>            -> print the grounding pack (JSON)
//      node scripts/ideator.mjs <dataset.json> <ideas.json> -> validate an ideas file
import fs from "node:fs";

export const hookWords = (hook) => String(hook || "").trim().split(/\s+/).filter(Boolean).length;
const EM_DASH = /—/;

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
    if (EM_DASH.test(idea.hook || "") || EM_DASH.test(idea.angle || "")) errs.push(`${w} contains an em dash (banned in his voice)`);
  });
  return errs;
}

// CLI
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [dsPath, ideasPath] = process.argv.slice(2);
  if (!dsPath) { console.error("usage: node ideator.mjs <dataset.json> [ideas.json]"); process.exit(1); }
  const ds = JSON.parse(fs.readFileSync(dsPath, "utf8"));
  if (ideasPath) {
    const ideas = JSON.parse(fs.readFileSync(ideasPath, "utf8")).ideas || [];
    const errs = validateIdeas(ideas);
    if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
    console.log(`OK — ${ideas.length} ideas valid`);
  } else {
    console.log(JSON.stringify(buildIdeaContext(ds), null, 2));
  }
}
