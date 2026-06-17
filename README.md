# Viral Radar — Claude Code skills

Find viral reels in your niche in instagram from the competitors you choose. Run two commands — `/viral-radar` to set up your browser and niche, then `/viral-competitor @handle1 @handle2` to add competitors — and get a local dark HTML dossier explaining what's working and why, with storyboard frames, transcripts, hook analysis, and a ranked synthesis of replicable plays.

---

## Requirements

`./install.sh` (below) installs and configures most of this for you. You only need these in place **first**:

- **Claude Code** — the CLI ([install](https://docs.anthropic.com/en/docs/claude-code))
- **Node 20+** — [nodejs.org](https://nodejs.org)
- **Homebrew** (macOS only) — [brew.sh](https://brew.sh) — so the installer can add yt-dlp + ffmpeg

The installer then sets up automatically:

- **chrome-devtools MCP** — drives the automation browser for Instagram scraping (`claude mcp add chrome-devtools …`)
- **yt-dlp** + **ffmpeg** — download reels and extract storyboard frames

Optional (not installed automatically):

- **Whisper** — local transcripts: `pip install openai-whisper` — or set **GROQ_API_KEY** / **OPENAI_API_KEY** for cloud transcription
- **nexlev MCP** — fallback enrichment when local media extraction fails

---

## Install

```bash
git clone https://github.com/thejmvai/claude-viral-radar && cd claude-viral-radar && ./install.sh
```

`install.sh` checks for and installs **yt-dlp** + **ffmpeg** (via Homebrew on macOS or apt on Linux), adds the **chrome-devtools MCP**, and copies both skills into `~/.claude/skills/`. It is safe to re-run and only installs what is missing. Restart Claude Code afterward so the skills and MCP load.

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

**The report is an interactive HTML page** — open `report-latest.html` in any browser to click through each reel's storyboard frames, expand transcripts, and copy them. PDF is optional: from the browser, **Print → Save as PDF**. The print layout lays out every reel's full frame filmstrip and auto-expands transcripts, so nothing is lost in the flat export.

---

## How it scores

Each reel gets a **signal score** (0–100) combining engagement quality (like-rate relative to a 4% benchmark), organic comment rate, and breakout multiple (views divided by creator median). Reels with a like-rate below 0.5% are automatically quarantined as "boosted" — they passed volume thresholds but show signs of paid reach — and excluded from the synthesis and lessons.

---

## Privacy

Your Instagram login stays in your local browser profile and is never read or stored by the skill. The skill only reads the public page content it navigates to in order to build your local report. Nothing is sent to any external service except the pages themselves.

---

## License

MIT (c) 2026 @jamesonc_ai
