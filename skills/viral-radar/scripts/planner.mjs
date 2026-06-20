// Planner: turn the Ideator's reviewed ideas into a dated content calendar. Deterministic scheduling —
// scheduleDates is pure (pass startDate explicitly, no "now" inside) so the calendar is reproducible.
// The Planner schedules; it never posts. See workflows/planner.md.
//
// CLI: node scripts/planner.mjs <ideas.json> [--start=YYYY-MM-DD] [--days=Mon,Wed,Fri] [--out=<path>]
import fs from "node:fs";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The next `count` posting slots on/after startDate, restricted to the given weekdays (names or 0-6).
export function scheduleDates(startDate, daysOfWeek = ["Mon", "Wed", "Fri"], count = 0) {
  const want = new Set(
    (daysOfWeek || []).map((d) => (typeof d === "number" ? d : DAYS.indexOf(d))).filter((d) => d >= 0)
  );
  const out = [];
  if (!want.size || count <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ""))) return out;
  let d = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i < 366 && out.length < count; i++) {
    if (want.has(d.getUTCDay())) out.push({ date: d.toISOString().slice(0, 10), day: DAYS[d.getUTCDay()] });
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

// Assign each idea (in array order) to a posting slot.
export function buildPlan(ideas = [], { startDate, daysOfWeek = ["Mon", "Wed", "Fri"] } = {}) {
  const slots = scheduleDates(startDate, daysOfWeek, ideas.length);
  const schedule = ideas.map((idea, i) => ({
    slot: i + 1,
    date: slots[i] ? slots[i].date : null,
    day: slots[i] ? slots[i].day : null,
    hook: idea.hook || "",
    format: idea.format || "",
    angle: idea.angle || "",
    grounding: idea.grounding || null,
  }));
  return { startDate, daysOfWeek, count: ideas.length, schedule };
}

export function validatePlan(plan) {
  const errs = [];
  if (!plan || !Array.isArray(plan.schedule)) return ["plan.schedule is not an array"];
  if (!plan.schedule.length) return ["plan.schedule is empty"];
  plan.schedule.forEach((s, i) => {
    if (!s.date) errs.push(`schedule[${i}] missing date (ran out of slots — widen --days or check --start)`);
    if (!String(s.hook || "").trim()) errs.push(`schedule[${i}] missing hook`);
  });
  return errs;
}

// CLI
function arg(name, def = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : def;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const ideasPath = process.argv[2];
  if (!ideasPath) { console.error("usage: node planner.mjs <ideas.json> [--start=YYYY-MM-DD] [--days=Mon,Wed,Fri] [--out=<path>]"); process.exit(1); }
  const ideasFile = JSON.parse(fs.readFileSync(ideasPath, "utf8"));
  const ideas = ideasFile.ideas || [];
  const niche = ideasFile.niche || "niche";
  const startDate = arg("start") || new Date().toISOString().slice(0, 10);
  const daysOfWeek = (arg("days") || "Mon,Wed,Fri").split(",").map((s) => s.trim()).filter(Boolean);
  const plan = { niche, generatedAt: new Date().toISOString(), ...buildPlan(ideas, { startDate, daysOfWeek }) };
  const errs = validatePlan(plan);
  if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
  const out = arg("out") || `viral-radar-out/plan-${niche}.json`;
  fs.writeFileSync(out, JSON.stringify(plan, null, 2));
  console.log(`Content calendar — ${plan.count} posts, ${daysOfWeek.join("/")}, from ${startDate}\n`);
  for (const s of plan.schedule) console.log(`  ${s.date} ${s.day}  ·  "${s.hook}"  [${s.format}]`);
  console.log(`\nSaved: ${out}`);
}
