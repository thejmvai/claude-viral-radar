# Viral Radar — Claude Code skill

A daily viral-reel research engine for a niche. Run `/viral-radar` and it scrapes the Instagram profiles you track, detects reels that hit viral thresholds, downloads storyboard frames and audio, transcribes the script, and synthesizes what's working — all written to a local dark HTML report you can read in the browser or print to PDF.

---

## Install

```bash
git clone https://github.com/thejmvai/claude-viral-radar ~/.claude/skills/claude-viral-radar
```

Claude Code picks up skills from `~/.claude/skills/` automatically. Restart Claude Code after cloning.

---

## Requirements

- **Claude Code** — the CLI (runs this skill)
- **yt-dlp** — `brew install yt-dlp` or `pip install yt-dlp`
- **ffmpeg** — `brew install ffmpeg`
- **Whisper** (optional, for local transcription) — `pip install openai-whisper`
- **GROQ_API_KEY** or **OPENAI_API_KEY** (optional) — cloud Whisper fallback
- **nexlev MCP** (optional) — fallback enrichment when local media extraction fails

---

## Usage

1. In your project directory, run:
   ```
   /viral-radar
   ```
2. On first run, a starter config is created at `viral-radar-out/ai-claude.config.json`. Open it and add the Instagram handles you want to track to `trackedHandles`:
   ```json
   "trackedHandles": ["yourhandle1", "yourhandle2"]
   ```
3. Re-run `/viral-radar`. The skill scrapes, enriches, and writes:
   - `viral-radar-out/ai-claude.json` — the full dataset
   - `viral-radar-out/report-latest.html` — the dark HTML dossier

---

## Output

Everything lands in `viral-radar-out/` inside your current working directory:

```
viral-radar-out/
  ai-claude.config.json       — your niche config (edit to add handles)
  ai-claude.json              — viral dataset (JSON)
  cache/ai-claude-seen.json   — dedup cache (auto-managed)
  frames/<shortcode>/1-4.jpg  — storyboard frames
  report-2026-06-17.html      — dated HTML report
  report-latest.html          — symlink/copy to latest report
```

Open `report-latest.html` in Chrome and print to PDF for a shareable one-pager.

---

## How it scores

Each reel gets a **signal score** (0–100) computed from engagement quality (like-rate relative to 4% benchmark), organic comment rate, breakout multiple (views ÷ creator median), and creator replicability (small accounts score higher — their results are easier to replicate).

Reels with a like-rate below 0.5% are automatically quarantined as "boosted" — they pass volume thresholds but show signs of paid reach, so they're excluded from the lessons and synthesis.

---

## License

MIT, Copyright (c) 2026 @jamesonc_ai
