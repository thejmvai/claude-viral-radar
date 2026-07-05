// Post-render report checker: verifies every asset a rendered report references actually resolves —
// relative src/href paths must exist on disk next to the report, empty refs are flagged, data: URIs
// and external http(s) links are counted but not fetched. render-report.mjs runs this automatically
// after every write (the routine "no broken photos" gate); it also works standalone on any report.
//
// CLI: node check-report.mjs <report.html>   -> exit 0 clean, exit 2 with a list when refs are broken
import fs from "node:fs";
import path from "node:path";

// All src="..."/href="..." values in the HTML, in order.
export function extractAssetRefs(html) {
  const refs = [];
  const re = /(?:src|href)="([^"]*)"/g;
  let m;
  while ((m = re.exec(String(html || "")))) refs.push(m[1]);
  return refs;
}

// Classify + verify refs against baseDir (the directory the report lives in).
// Returns { local, missing, dataUris, external, anchors } — missing ⊆ local refs.
export function verifyReportAssets(html, baseDir) {
  let dataUris = 0, external = 0, anchors = 0, local = 0;
  const missing = [];
  for (const r of extractAssetRefs(html)) {
    if (r === "") { local++; missing.push("(empty ref)"); continue; }
    if (r.startsWith("data:")) { dataUris++; continue; }
    if (/^(https?:)?\/\//.test(r) || r.startsWith("mailto:")) { external++; continue; }
    if (r.startsWith("#")) { anchors++; continue; }
    local++;
    const clean = decodeURIComponent(r.split("#")[0].split("?")[0]);
    if (!fs.existsSync(path.resolve(baseDir, clean))) missing.push(r);
  }
  return { local, missing, dataUris, external, anchors };
}

// One-line human verdict for CLI + render-report integration.
export function formatCheck(res, reportPath = "report") {
  if (res.missing.length) {
    const first = res.missing.slice(0, 3).join(", ");
    return `✗ ${reportPath}: ${res.missing.length}/${res.local} local asset refs are BROKEN (e.g. ${first}). ` +
      `If this is an archived report, re-render with --frames-base=../../frames/`;
  }
  return `✓ ${reportPath}: ${res.local} local refs resolve, ${res.dataUris} inlined, ${res.external} external links`;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const p = process.argv[2];
  if (!p) { console.error("usage: node check-report.mjs <report.html>"); process.exit(1); }
  const res = verifyReportAssets(fs.readFileSync(p, "utf8"), path.dirname(path.resolve(p)));
  console.log(formatCheck(res, p));
  process.exit(res.missing.length ? 2 : 0);
}
