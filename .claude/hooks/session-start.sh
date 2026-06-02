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
npm install
