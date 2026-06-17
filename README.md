# Viral Radar — Claude Code skills

Find viral reels in your niche in instagram from the competitors you choose. Run two commands — `/viral-radar` to set up your browser and niche, then `/viral-competitor @handle1 @handle2` to add competitors — and get a local dark HTML dossier explaining what's working and why, with storyboard frames, transcripts, hook analysis, and a ranked synthesis of replicable plays.

---

## Requirements

- **Claude Code** — the CLI ([install](https://docs.anthropic.com/en/docs/claude-code))
- **chrome-devtools MCP** — drives the automation browser for Instagram scraping; add once:
  ```
  claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest
  ```
- **yt-dlp** — `brew install yt-dlp` or `pip install yt-dlp`
- **ffmpeg** — `brew install ffmpeg`
- **Whisper** (optional, local transcription) — `pip install openai-whisper`
- **GROQ_API_KEY** or **OPENAI_API_KEY** (optional) — cloud Whisper fallback for transcription
- **nexlev MCP** (optional) — fallback enrichment when local media extraction fails

---

## Install

```bash
git clone https://github.com/thejmvai/claude-viral-radar && cd claude-viral-radar && ./install.sh
```

Restart Claude Code after installing. The skills are picked up automatically from `~/.claude/skills/`.

---

## Usage

**1. Set up (once)**

```
/viral-radar
```

On first run, the skill checks your automation browser, walks you through a one-time Instagram login in the browser window, and asks what niche you're in. Takes about 2 minutes.

**2. Add competitors**

```
/viral-competitor @creator1 @creator2
```

Adds those handles to your tracker, immediately scrapes their reels, enriches the viral ones with storyboard frames + transcript + structural analysis, and writes a fresh report.

**3. Refresh anytime**

```
/viral-radar
```

Scrapes all tracked handles and rebuilds the report with new viral reels since the last run.

---

## Output

Everything lands in `viral-radar-out/` in your current working directory:

```
viral-radar-out/
  <niche>.config.json         — your niche config and tracked handles
  <niche>.json                — full viral dataset (JSON)
  cache/<niche>-seen.json     — dedup cache (auto-managed)
  frames/<shortcode>/1-4.jpg  — storyboard frames
  report-YYYY-MM-DD.html      — dated HTML report
  report-latest.html          — always points to the latest report
```

Open `report-latest.html` in Chrome and print to PDF for a shareable dossier.

---

## How it scores

Each reel gets a **signal score** (0–100) combining engagement quality (like-rate relative to a 4% benchmark), organic comment rate, and breakout multiple (views divided by creator median). Reels with a like-rate below 0.5% are automatically quarantined as "boosted" — they passed volume thresholds but show signs of paid reach — and excluded from the synthesis and lessons.

---

## Privacy

Your Instagram login stays in your local browser profile and is never read or stored by the skill. The skill only reads the public page content it navigates to in order to build your local report. Nothing is sent to any external service except the pages themselves.

---

## License

MIT (c) 2026 @jamesonc_ai
