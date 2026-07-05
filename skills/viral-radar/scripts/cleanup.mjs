// Retention cleanup: every radar run leaves intermediates behind (date archives, frame dirs, run
// worklists, .bak safety copies). This prunes them deterministically so viral-radar-out stops growing
// forever, WITHOUT breaking anything still referenced:
//   - reports/: keep the newest `keepArchives` date folders (config.keepArchives, default 5)
//   - frames/<shortcode>: keep every shortcode referenced by the live dataset OR any KEPT archive
//   - worklist-*.json: delete when older than `worklistMaxAgeDays` (default 7)
//   - .bak-*: delete when older than `bakMaxAgeDays` (default 30)
// Planning is pure (unit-tested); the CLI applies it. See workflows/cleanup.md.
//
// CLI: node cleanup.mjs [--niche=ai-claude] [--keep-archives=5] [--dry-run]
import fs from "node:fs";
import path from "node:path";

// Every shortcode any of the given datasets still references (reels + quarantined + offTopic).
export function collectReferencedShortcodes(datasets = []) {
  const out = new Set();
  for (const ds of datasets) {
    for (const r of [...(ds?.reels || []), ...(ds?.quarantined || []), ...(ds?.offTopic || [])]) {
      if (r && r.shortcode) out.add(r.shortcode);
    }
  }
  return out;
}

// Pure planner. archives: [{name}] (date-named folders, lexically sortable); frames: [names];
// worklists/baks: [{name, mtimeMs}]. Returns what to delete.
export function planCleanup({ archives = [], frames = [], worklists = [], baks = [], referenced = new Set(),
  keepArchives = 5, worklistMaxAgeDays = 7, bakMaxAgeDays = 30, now = Date.now() } = {}) {
  const sorted = [...archives].map((a) => a.name).sort(); // date-named -> lexical == chronological
  const keptArchives = new Set(sorted.slice(-Math.max(0, keepArchives)));
  const deleteArchives = sorted.filter((n) => !keptArchives.has(n));
  const deleteFrames = frames.filter((n) => !referenced.has(n));
  const ageMs = (d) => d * 86400000;
  const deleteWorklists = worklists.filter((w) => now - w.mtimeMs > ageMs(worklistMaxAgeDays)).map((w) => w.name);
  const deleteBaks = baks.filter((b) => now - b.mtimeMs > ageMs(bakMaxAgeDays)).map((b) => b.name);
  return { keptArchives: [...keptArchives], deleteArchives, deleteFrames, deleteWorklists, deleteBaks };
}

// --- CLI ---------------------------------------------------------------------
function arg(name, def = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=").slice(1).join("=");
  return process.argv.includes(`--${name}`) ? true : def;
}
const argStr = (name, def = "") => { const v = arg(name, def); return v === true || v == null ? def : String(v); };

const dirSize = (p) => {
  let n = 0;
  try { for (const e of fs.readdirSync(p, { withFileTypes: true })) n += e.isDirectory() ? dirSize(path.join(p, e.name)) : fs.statSync(path.join(p, e.name)).size; } catch {}
  return n;
};

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const OUT = "viral-radar-out";
  let niche = argStr("niche");
  if (!niche) {
    const cfgs = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.endsWith(".config.json")) : [];
    niche = cfgs[0] ? cfgs[0].replace(".config.json", "") : "ai-claude";
  }
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(OUT, `${niche}.config.json`), "utf8")); } catch {}
  const keepArchives = Number(argStr("keep-archives")) || Number(cfg.keepArchives) || 5;
  const dry = arg("dry-run") === true;

  const list = (p) => (fs.existsSync(p) ? fs.readdirSync(p) : []);
  const archives = list(path.join(OUT, "reports")).filter((n) => !n.startsWith(".")).map((name) => ({ name }));
  const framesDirs = list(path.join(OUT, "frames")).filter((n) => !n.startsWith("."));
  const stat = (p) => ({ mtimeMs: fs.statSync(p).mtimeMs });
  const worklists = list(OUT).filter((n) => /^worklist-.*\.json$/.test(n)).map((name) => ({ name, ...stat(path.join(OUT, name)) }));
  const baks = list(OUT).filter((n) => n.startsWith(".bak-")).map((name) => ({ name, ...stat(path.join(OUT, name)) }));

  // Datasets that still pin frames: the live one + every KEPT archive's snapshot.
  const live = JSON.parse(fs.readFileSync(path.join(OUT, `${niche}.json`), "utf8"));
  const plan0 = planCleanup({ archives, frames: [], keepArchives });
  const keptDs = plan0.keptArchives.flatMap((a) =>
    list(path.join(OUT, "reports", a)).filter((f) => f.endsWith(".json")).map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(OUT, "reports", a, f), "utf8")); } catch { return null; }
    })
  ).filter(Boolean);
  const referenced = collectReferencedShortcodes([live, ...keptDs]);

  const plan = planCleanup({ archives, frames: framesDirs, worklists, baks, referenced, keepArchives });
  let freed = 0;
  const rm = (p) => { freed += dirSize(p) || (fs.existsSync(p) ? fs.statSync(p).size : 0); if (!dry) fs.rmSync(p, { recursive: true, force: true }); };
  for (const n of plan.deleteArchives) rm(path.join(OUT, "reports", n));
  for (const n of plan.deleteFrames) rm(path.join(OUT, "frames", n));
  for (const n of plan.deleteWorklists) rm(path.join(OUT, n));
  for (const n of plan.deleteBaks) rm(path.join(OUT, n));
  console.log(`${dry ? "[dry-run] would free" : "freed"} ${(freed / 1048576).toFixed(0)}MB — archives -${plan.deleteArchives.length} (kept ${plan.keptArchives.length}), frames -${plan.deleteFrames.length} (${referenced.size} referenced), worklists -${plan.deleteWorklists.length}, baks -${plan.deleteBaks.length}`);
}
