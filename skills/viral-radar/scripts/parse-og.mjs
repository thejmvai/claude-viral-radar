const MONTHS = { January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12 };

export function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#064;/g, "@")
    .replace(/&#x2014;/g, "—")
    .replace(/&#x2019;/g, "’")
    .replace(/&#x2026;/g, "…")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function toNum(s) {
  const m = String(s).trim().match(/^([\d.,]+)\s*([KMB]?)/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/,/g, ""));
  if (m[2] === "K") n *= 1e3;
  if (m[2] === "M") n *= 1e6;
  if (m[2] === "B") n *= 1e9; // billion-view reels exist — without this they parsed as ~1 view
  return Math.round(n);
}

// Shared count parser for "1.2M", "847k", "1,234 views", etc. (case-insensitive). Reused by scrape-cdp.
export const parseCount = (s) => toNum(String(s ?? "").toUpperCase());

// "<likes> likes, <comments> comments - <handle> on <Month D, YYYY>: \"<caption>\". "
export function parseOgDescription(og) {
  const decoded = og || "";
  const head = decoded.match(/^([\d.,KMB]+)\s+likes,\s+([\d.,KMB]+)\s+comments\s+-\s+([^\s]+)\s+on\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  const out = { likes: 0, comments: 0, handle: null, postedAt: null, caption: "" };
  if (head) {
    out.likes = toNum(head[1]);
    out.comments = toNum(head[2]);
    out.handle = head[3];
    const mo = MONTHS[head[4]] || 0;
    out.postedAt = `${head[6]}-${String(mo).padStart(2, "0")}-${String(head[5]).padStart(2, "0")}`;
  }
  const cap = decoded.match(/:\s*&quot;([\s\S]*?)&quot;\.?\s*$/) || decoded.match(/:\s*"([\s\S]*?)"\.?\s*$/);
  if (cap) out.caption = decodeEntities(cap[1]).trim();
  return out;
}
