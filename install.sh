#!/bin/sh
# Install the Viral Radar skills into your Claude Code skills directory.
set -e
DEST="${HOME}/.claude/skills"
mkdir -p "$DEST"
cp -R skills/viral-radar "$DEST/"
cp -R skills/viral-competitor "$DEST/"
echo "Installed: viral-radar + viral-competitor -> $DEST"
echo "Next: open Claude Code and run /viral-radar to set up your browser and niche."
