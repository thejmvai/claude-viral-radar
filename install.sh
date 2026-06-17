#!/bin/sh
# Viral Radar setup. One-stop installer: checks/installs the dependencies, adds
# the chrome-devtools MCP, and installs every skill the app needs into
# ~/.claude/skills/ -- viral-radar + viral-competitor (this repo) and the
# last30days trend skill (fetched from its upstream repo).
# Safe to re-run: it only installs what is missing and always refreshes skills.

say()  { printf "\n\033[1m%s\033[0m\n" "$1"; }
ok()   { printf "  \033[32mok\033[0m   %s\n" "$1"; }
warn() { printf "  \033[33mtodo\033[0m %s\n" "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

say "Viral Radar setup"

OS="$(uname -s)"
PM=""
if have brew; then PM="brew"; elif have apt-get; then PM="apt"; fi

# --- Claude Code CLI ---------------------------------------------------------
if have claude; then ok "Claude Code CLI"; else
  warn "Claude Code not found. Install it first: https://docs.anthropic.com/en/docs/claude-code"
fi

# --- Node 20+ ----------------------------------------------------------------
if have node; then ok "node $(node -v)"; else
  warn "node not found. Install Node 20+: https://nodejs.org"
fi

# --- Homebrew (macOS): detect only, never auto-install -----------------------
if [ "$OS" = "Darwin" ] && [ -z "$PM" ]; then
  warn "Homebrew not found (needed to install yt-dlp + ffmpeg on macOS). Install it, then re-run ./install.sh:"
  printf '       /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\n'
fi

# --- yt-dlp ------------------------------------------------------------------
if have yt-dlp; then ok "yt-dlp"; else
  case "$PM" in
    brew) say "Installing yt-dlp (brew)..."; brew install yt-dlp && ok "yt-dlp installed" || warn "yt-dlp install failed — see https://github.com/yt-dlp/yt-dlp#installation" ;;
    apt)  say "Installing yt-dlp (apt, needs sudo)..."; sudo apt-get update && sudo apt-get install -y yt-dlp && ok "yt-dlp installed" || warn "yt-dlp install failed — try: pip install yt-dlp" ;;
    *)    warn "yt-dlp not found and no package manager detected. Install: https://github.com/yt-dlp/yt-dlp#installation (or 'pip install yt-dlp')" ;;
  esac
fi

# --- ffmpeg ------------------------------------------------------------------
if have ffmpeg; then ok "ffmpeg"; else
  case "$PM" in
    brew) say "Installing ffmpeg (brew)..."; brew install ffmpeg && ok "ffmpeg installed" || warn "ffmpeg install failed — see https://ffmpeg.org/download.html" ;;
    apt)  say "Installing ffmpeg (apt, needs sudo)..."; sudo apt-get install -y ffmpeg && ok "ffmpeg installed" || warn "ffmpeg install failed — see https://ffmpeg.org/download.html" ;;
    *)    warn "ffmpeg not found. Install: https://ffmpeg.org/download.html" ;;
  esac
fi

# --- chrome-devtools MCP -----------------------------------------------------
if have claude; then
  if claude mcp list 2>/dev/null | grep -qi "chrome-devtools"; then
    ok "chrome-devtools MCP already configured"
  else
    say "Adding the chrome-devtools MCP..."
    if claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest; then
      ok "chrome-devtools MCP added (restart Claude Code to load it)"
    else
      warn "Could not add the MCP automatically. Run it yourself: claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest"
    fi
  fi
else
  warn "Skipped the MCP step (no claude CLI). After installing Claude Code run:"
  printf '       claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest\n'
fi

# --- install this repo's skills ----------------------------------------------
say "Installing the skills..."
DEST="${HOME}/.claude/skills"
mkdir -p "$DEST"
cp -R skills/viral-radar "$DEST/" && cp -R skills/viral-competitor "$DEST/" \
  && ok "viral-radar + viral-competitor -> $DEST" \
  || warn "Could not copy skills into $DEST"

# --- Python 3.12+ (required by the last30days trend skill) -------------------
PYOK=""
for py in python3.14 python3.13 python3.12 python3; do
  if have "$py" && "$py" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)' 2>/dev/null; then
    PYOK="$py"; break
  fi
done
if [ -n "$PYOK" ]; then ok "python ($PYOK) for last30days"; else
  warn "Python 3.12+ not found (needed by last30days). Install it: https://www.python.org/downloads/"
fi

# --- last30days trend skill (fetched from upstream) --------------------------
# Pulls the latest from github.com/mvanhorn/last30days-skill (MIT) so the radar
# can research what a niche is talking about, not just scrape competitor reels.
say "Installing the last30days trend skill (from upstream)..."
if have git; then
  L30_TMP="$(mktemp -d)"
  if git clone --depth 1 https://github.com/mvanhorn/last30days-skill "$L30_TMP/last30days-skill" >/dev/null 2>&1; then
    cp -R "$L30_TMP/last30days-skill/skills/last30days" "$DEST/" \
      && ok "last30days -> $DEST" \
      || warn "Could not copy last30days into $DEST"
  else
    warn "Could not fetch last30days (offline?). Install later: git clone https://github.com/mvanhorn/last30days-skill && cp -R last30days-skill/skills/last30days ~/.claude/skills/"
  fi
  rm -rf "$L30_TMP"
else
  warn "git not found — skipped last30days. Install git, then re-run ./install.sh"
fi

# --- optional ----------------------------------------------------------------
have whisper && ok "whisper (transcripts)" || warn "Whisper not found (optional, for transcripts): pip install openai-whisper  — or set GROQ_API_KEY / OPENAI_API_KEY"

say "Setup complete. Restart Claude Code, then run /viral-radar to log in and pick your niche. Use /last30days <your niche> to see what the niche is talking about right now."
