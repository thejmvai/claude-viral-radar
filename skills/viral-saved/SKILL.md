---
name: viral-saved
description: Turn YOUR Instagram "Saved" reels into a swipe-file report. Scrapes your private saved collection (only your logged-in browser can see it), downloads frames + transcripts, breaks down each reel's hook/structure/why-it-works, and renders a dark HTML report that leads with the patterns across everything you saved. Trigger on /viral-saved, "analyze my saved reels", "swipe file from my saves". Sibling of /viral-competitor, but pointed at your own saves instead of a competitor's grid.
---

# viral-saved — your saved reels → a swipe-file report

Your Instagram Saved bookmarks are **private** — no API sees them. This works only through a Chrome that
YOU are logged into. That login is the single manual step; everything after it is automated. The report is
a **swipe file**: it leads with the cross-reel synthesis + replicable plays, groups reels by hook
archetype, and shows engagement as context — it does NOT rank by virality (meaningless on hand-picked saves).

Pipeline: `scrape-saved.mjs` → `enrich-saved.mjs` (self-contained download + local transcript) →
breakdown (subagent reads frames + transcripts) → `render-swipe.mjs` → open.

**Requires:** `yt-dlp`, `ffmpeg`, `whisper` (a model cached in `~/.cache/whisper` — the enrich script
auto-picks a cached one so it never needs the network). `yt-dlp` + `ffmpeg` are installed by this repo's
`install.sh`; `whisper` is `pip install openai-whisper` (any `.en` model works).

**Default working dir:** `viral-radar-out/saved/` under the directory you run from (the same
`viral-radar-out/` root the rest of Viral Radar uses). Let `OUT` = that path below. `<skill>` =
`~/.claude/skills/viral-saved`.

---

## Step 0 — confirm the debug browser (YOU do this once)

Check it's up: `curl -s --max-time 3 http://localhost:9222/json/version`. If that fails, hand the user this and stop:

```
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 "--remote-allow-origins=*" \
  --user-data-dir="$HOME/.viral-radar-chrome"
```

They log into Instagram in that window (this profile stays local, separate from their main Chrome — it's the
same `.viral-radar-chrome` profile the main viral-radar skill uses), then say "browser's up."

Confirm the handle and whether to pull **all saved** (default) or a specific collection. For a named
collection, ask them to open it in that browser and paste the URL.

## Step 1 — scrape the saved collection

```
node <skill>/scripts/scrape-saved.mjs --user=<handle> --collection=all-posts --max=60 --out="$OUT/worklist-saved.json"
```

(or `--url="<pasted saved-collection URL>"` for a named collection). Writes the worklist. Photo posts are
kept as tiles here but drop out at enrichment (no video). If it returns 0 tiles it's usually a soft-block or
a logged-out browser — wait a few minutes and retry, or re-check the login.

## Step 2 — enrich (download frames + audio + transcript)

```
node <skill>/scripts/enrich-saved.mjs --worklist="$OUT/worklist-saved.json"
```

Deterministic; no model tokens. Handles the login cookies, whisper SSL/model fallbacks, photo-post skips,
and one download retry automatically. Writes `frames/<sc>/{1-4.jpg, hook-0..2.jpg, audio.m4a, audio.txt,
meta.json}` and an `enrich-summary.json` listing complete vs partial. Read the summary — only the
**complete** shortcodes go into the report.

## Step 3 — break down each reel (DELEGATE to a subagent to keep frames off the main thread)

Spawn one general-purpose subagent (a mid-tier model is enough). Give it the complete shortcodes, the worklist
path, and `$OUT/frames/`. It Reads each reel's 3 hook frames + 4 storyboard frames + `meta.json` transcript
and produces the **swipe dataset** at `$OUT/swipe-saved.json`:

```json
{
  "label": "Saved Reels — Swipe File",
  "generatedAt": "<YYYY-MM-DD>",
  "scrapedFrom": "@<handle> saved",
  "synthesis": "<250-400 words: hook patterns that repeat, formats that dominate, what the saves reveal about the user's taste>",
  "plays": ["<5 concrete, tactical, replicable plays for the user's own account>"],
  "reels": [{
    "shortcode": "", "url": "", "handle": "@", "creatorName": "",
    "metrics": { "likes": 0, "comments": 0, "durationSec": 0 },
    "hookType": "<archetype for grouping, e.g. 'Contrarian reversal', 'Tool demo / screen-record', 'Rapid tips / listicle', 'Discovery / curation', 'Tier-list / ranking'>",
    "hook": "<the opening scroll-stopper, 1 sentence>",
    "hookDelivery": "<'Text-on-screen over b-roll' | 'Talking head' | 'Voiceover over screen-record'>",
    "format": "<short label>",
    "breakdown": "<3-6 sentences, beat-by-beat, grounded in the frames + transcript>",
    "whyItWorks": "<2-4 sentences: the replicable mechanism>",
    "transcript": "<from meta.json>",
    "storyboard": [{ "timestamp": "0:00", "role": "Hook", "caption": "<on-screen>", "frame": "frames/<sc>/1.jpg" }, "...4 total, roles Hook/Build/Payoff/CTA-End..."],
    "hookFrames": ["frames/<sc>/hook-0.jpg", "frames/<sc>/hook-1.jpg", "frames/<sc>/hook-2.jpg"],
    "partial": false
  }]
}
```

Frame paths MUST be relative and start with `frames/`. `hookType` drives the grouping — reuse the same
label across reels that share an archetype so they group together.

## Step 4 — render + open

```
node <skill>/scripts/render-swipe.mjs "$OUT/swipe-saved.json" "$OUT/swipe-file.html"
```

It self-verifies every image ref and exits 2 on any broken one — a non-zero exit is a STOP, fix the frame
path and re-render. Then `open "$OUT/swipe-file.html"` and report to the user: the synthesis, the plays,
and any partial reels. Ask whether the archetype grouping feels right (tune the `hookType` labels if not).

## Notes
- Scripts are self-contained (no runtime dependency on the viral-radar skill) — only the CLI binaries above.
- Re-running is safe: enrich skips reels whose frames already exist. To force a fresh pull, delete
  `$OUT/frames/<sc>/`.
- This is read-only against Instagram. Keep `--max` reasonable and pace re-runs; IG soft-blocks bursts.
