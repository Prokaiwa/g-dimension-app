#!/bin/bash
set -euo pipefail

# Claude Code on the web starts each session in a fresh container: the repo is
# cloned but node_modules is not installed. Install dependencies so `npm run
# build` and `npm run lint` work immediately. No-op outside the remote
# environment (local checkouts already have their deps).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# ── Force-sync to the REAL latest main ───────────────────────────────────────
# The web container can provision a STALE, SHALLOW clone whose local origin/main
# ref is frozen at an old commit. In that state `git checkout main` reports
# "up to date with origin/main" while actually being many commits behind GitHub,
# silently hiding newer work. So: fetch explicitly, deepen the shallow history
# (so a fast-forward can reconnect the severed history), then fast-forward main.
#
# --ff-only NEVER clobbers uncommitted or local-only work: if it can't cleanly
# fast-forward it warns and leaves the tree untouched for manual review.

# Fetch with a few retries for transient proxy/network hiccups (2s,4s,8s).
fetch_main() {
  local n=0
  until git fetch origin main; do
    n=$((n + 1)); [ "$n" -ge 4 ] && return 1
    sleep $((2 ** n))
  done
}
fetch_main || echo "WARN: git fetch origin main failed — continuing on local state"

# Deepen a shallow clone so origin/main's history connects to HEAD (required for
# the fast-forward below; otherwise git sees "unrelated histories").
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  git fetch --unshallow origin 2>/dev/null \
    || git fetch --depth=1000 origin main 2>/dev/null \
    || true
fi

git checkout main
git merge --ff-only origin/main 2>/dev/null \
  || echo "WARN: main is not a clean fast-forward of origin/main — sync manually before working"

# Visible proof of what we're ACTUALLY on, so staleness can't hide again.
echo "On main @ $(git rev-parse --short HEAD) — $(git log -1 --format='%s (%cd)' --date=short)"

npm install
