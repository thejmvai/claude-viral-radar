# Workflow — Retention cleanup (Step 6.6)

**Objective:** viral-radar-out must not grow forever. Every run prunes what nothing references.

**Tool:** `scripts/cleanup.mjs` — pure planner (`planCleanup`, `collectReferencedShortcodes`) + CLI.
`node scripts/cleanup.mjs --niche=<niche> [--keep-archives=N] [--dry-run]`

**Policy:** keep newest `config.keepArchives` (default 5) date archives; keep `frames/<shortcode>`
only if the live dataset OR a kept archive still references it; worklists older than 7 days and
`.bak-*` older than 30 days are deleted. Prints MB freed.

**Edge cases:** archives are date-named so lexical sort == chronological; same-day `-HHMM` suffixes
sort correctly. Never deletes frames referenced by a kept archive (their reports would lose photos —
the check-report gate would catch it, but don't create the problem). Run `--dry-run` first if unsure.
