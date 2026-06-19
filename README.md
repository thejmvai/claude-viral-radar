# Viral Radar — Claude Code skills

Find viral reels in your niche in instagram from the competitors you choose. Run two commands — `/viral-radar` to set up your browser and niche, then `/viral-competitor @handle1 @handle2` to add competitors — and get a local dark HTML dossier explaining what's working and why, with storyboard frames, transcripts, hook analysis, and a ranked synthesis of replicable plays.

---

## Requirements

`./install.sh` (below) installs and configures most of this for you. You only need these in place **first**:

- **Claude Code** — the CLI ([install](https://docs.anthropic.com/en/docs/claude-code))
- **Node 20+** — [nodejs.org](https://nodejs.org)
- **Python 3.12+** — [python.org](https://www.python.org/downloads/) — used by the last30days trend skill
- **Homebrew** (macOS only) — [brew.sh](https://brew.sh) — so the installer can add yt-dlp + ffmpeg

The installer then sets up automatically:

- **chrome-devtools MCP** — drives the automation browser for Instagram scraping (`claude mcp add chrome-devtools …`)
- **yt-dlp** + **ffmpeg** — download reels and extract storyboard frames
- **last30days skill** — niche trend research, fetched from its [upstream repo](https://github.com/mvanhorn/last30days-skill)

Optional (not installed automatically):

- **Whisper** — local transcripts: `pip install openai-whisper` — or set **GROQ_API_KEY** / **OPENAI_API_KEY** for cloud transcription
- **nexlev MCP** — fallback enrichment when local media extraction fails

---

## Install

```bash
git clone https://github.com/thejmvai/claude-viral-radar && cd claude-viral-radar && ./install.sh
```

`install.sh` is a one-stop installer: it checks for and installs **yt-dlp** + **ffmpeg** (via Homebrew on macOS or apt on Linux), adds the **chrome-devtools MCP**, and installs **all three skills** into `~/.claude/skills/` — **viral-radar** and **viral-competitor** from this repo, plus **last30days** (trend research) fetched from its [upstream repo](https://github.com/mvanhorn/last30days-skill). It is safe to re-run and only installs what is missing. Restart Claude Code afterward so the skills and MCP load.

---

## How to operate it

The loop is **discover → track → scrape → rank → read.**

**1. Set up (once)**

```
/viral-radar
```

On first run, the skill checks your automation browser, walks you through a one-time Instagram login in the browser window (stays local, never stored), and asks what niche you're in. Takes about 2 minutes.

**2. Add creators you already know**

```
/viral-competitor @creator1 @creator2
```

Adds those handles to your tracker, scrapes their reels, and enriches the viral ones with storyboard frames + transcript + a structural breakdown.

**3. Discover creators you don't know yet**

```
node skills/viral-radar/scripts/discover.mjs --niche=<niche>
```

Searches your niche hashtags via the [ScrapeCreators](https://app.scrapecreators.com) API and surfaces new creators blowing up that you *don't* track yet, ranked by reach + niche presence + recency. It prints a ready-to-paste `/viral-competitor` line — add the best and they join your watchlist. (Needs a free ScrapeCreators key and `discoveryEnabled: true`.)

**4. Refresh anytime**

```
/viral-radar
```

Re-scrapes all tracked handles and rebuilds the report with new viral reels since the last run.

**5. See what your niche is talking about**

```
/last30days <your niche>
```

The bundled [last30days](https://github.com/mvanhorn/last30days-skill) skill researches the last 30 days across Reddit, YouTube, Hacker News, GitHub, and more. Pair *what your competitors posted* (Viral Radar) with *what the niche is actually discussing right now* (last30days) to pick your next topic. Keyless on Reddit, YouTube, Hacker News, and GitHub; X, TikTok, and Instagram unlock with optional API keys.

**What the radar decides for you**

- Keeps **every** viral reel (≥5 per creator), never a curated handful.
- Ranks by **recency-weighted signal** — fresh + high-engagement reels rise to the top.
- **Quarantines "boosted" reels** (big views, weak like-rate) so paid-looking reach doesn't pollute your lessons.

---

## Output

Everything lands in `viral-radar-out/` in your current working directory:

```
viral-radar-out/
  <niche>.config.json              — your niche config and tracked handles
  <niche>.json                     — full viral dataset (JSON)
  cache/<niche>-seen.json          — dedup cache (auto-managed)
  frames/<shortcode>/1-4.jpg       — storyboard frames
  reports/<YYYY-MM-DD>/report.html — dated report, archived per run
  reports/<YYYY-MM-DD>/<niche>.json— dataset snapshot for that run
  report-latest.html               — always points to the latest report
```

Each run is **cataloged by date** under `reports/<YYYY-MM-DD>/`, so past runs stay around to compare against. `report-latest.html` at the top level always points to the newest.

**The report is an interactive HTML page** — open `report-latest.html` in any browser to click through each reel's storyboard frames, expand transcripts, and copy them. PDF is optional: from the browser, **Print → Save as PDF**. The print layout lays out every reel's full frame filmstrip and auto-expands transcripts, so nothing is lost in the flat export.

When a `crossPlatform` block is attached to the dataset (e.g. from a `/last30days` run), the report splits into two tabs — **Instagram Reels** (your competitor library) and **Others** (a "Hot across the niche" view: niche-wide chatter from Reddit, TikTok, YouTube, and GitHub). PDF export shows both.

---

## How it scores

Each reel gets a **signal score** (0–100) combining engagement quality (like-rate relative to a 4% benchmark), organic comment rate, and breakout multiple (views divided by creator median). Reels with a like-rate below 0.5% are automatically quarantined as "boosted" — they passed volume thresholds but show signs of paid reach — and excluded from the synthesis and lessons.

## How it ranks

The report is a **full library, not a highlight reel.** Every gate-passing reel is kept — the funnel aims for **at least 5 per tracked channel** (`minPerHandle`), and no creator is trimmed to a single "best" pick. Reels are ordered by a **recency-weighted rank** that blends the signal score with **time of post**, so fresh, high-signal reels rise to the top. Tune the balance in your niche config: `recencyWeight` (0 = pure signal, 1 = pure recency; default 0.35) and `recencyHalfLifeDays` (default 30). Widen the catch with `scrapeTargetPerHandle` and `enrichmentCapPerRun`.

## Discovery (find new creators)

Tracked-handle scraping only watches creators you already listed. **Discovery** finds *new* ones: it searches your `seedHashtags` on Instagram via the [ScrapeCreators](https://app.scrapecreators.com) API, groups reels by creator, drops anyone you already track, and ranks the rest by reach + niche presence + recency.

```
node skills/viral-radar/scripts/discover.mjs --niche=<niche>
```

It writes `viral-radar-out/discovery-<niche>.json` and prints a ready-to-paste `/viral-competitor` line for the strongest finds. Enable it with `discoveryEnabled: true` plus a free `SCRAPECREATORS_API_KEY`. Discovery only *suggests* — you add the good ones with `/viral-competitor`.

## Telegram digest (optional)

Get a digest pushed to your phone after every run instead of opening the HTML file. It sends the top reels by rank (tappable to the reel), per-channel coverage, and the top "Hot across the niche" items.

```
node skills/viral-radar/scripts/notify-telegram.mjs --niche=<niche>            # send
node skills/viral-radar/scripts/notify-telegram.mjs --niche=<niche> --dry-run  # preview only
```

One-time setup (~3 min): create a bot with **@BotFather**, grab your chat id, and put `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` in `.claude/viral-radar.env` (gitignored). Full walkthrough: [`skills/viral-radar/guides/setup-telegram.md`](skills/viral-radar/guides/setup-telegram.md). No credentials = it just prints the digest and the run continues; it never blocks a run.

---

## Privacy

Your Instagram login stays in your local browser profile and is never read or stored by the skill. The skill only reads the public page content it navigates to in order to build your local report. Nothing is sent to any external service except the pages themselves.

---

## License

MIT (c) 2026 @jamesonc_ai
