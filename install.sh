#!/bin/sh
# Viral Radar setup. Checks for and installs the dependencies, adds the
# chrome-devtools MCP, and installs the two skills into ~/.claude/skills/.
# Safe to re-run: it only installs what is missing.

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

# --- install the skills ------------------------------------------------------
say "Installing the skills..."
DEST="${HOME}/.claude/skills"
mkdir -p "$DEST"
cp -R skills/viral-radar "$DEST/" && cp -R skills/viral-competitor "$DEST/" \
  && ok "viral-radar + viral-competitor -> $DEST" \
  || warn "Could not copy skills into $DEST"

# --- optional ----------------------------------------------------------------
have whisper && ok "whisper (transcripts)" || warn "Whisper not found (optional, for transcripts): pip install openai-whisper  — or set GROQ_API_KEY / OPENAI_API_KEY"

say "Setup complete. Restart Claude Code, then run /viral-radar to log in and pick your niche."
