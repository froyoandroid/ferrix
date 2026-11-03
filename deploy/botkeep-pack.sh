#!/usr/bin/env bash
# Build the frontend and pack a Botkeep ZIP (tracked files + frontend/dist) to /tmp/ferrix-botkeep.zip.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile
bun run --filter @ferrix/frontend build
rm -f /tmp/ferrix-botkeep.zip
git archive --format=zip -9 -o /tmp/ferrix-botkeep.zip HEAD
zip -qr9 /tmp/ferrix-botkeep.zip frontend/dist
ls -l /tmp/ferrix-botkeep.zip
