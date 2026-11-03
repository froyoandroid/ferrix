#!/bin/sh
# Botkeep start command: sh deploy/botkeep-start.sh
# The archive ships a prebuilt frontend/dist; the backend serves it (standalone mode).
set -e
cd "$(dirname "$0")/.."
bun install --frozen-lockfile
cd backend
export NODE_ENV=production HOST=0.0.0.0 PORT="${SERVER_PORT:-8787}" STATIC_DIR=../frontend/dist
exec bun src/index.ts
