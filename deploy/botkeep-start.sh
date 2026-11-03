#!/bin/sh
# Botkeep start command: sh deploy/botkeep-start.sh
# Botkeep source ZIPs must be text only, so binary assets (fonts) ship as
# <file>.b64.NN parts and are decoded here. The archive also ships a prebuilt frontend/dist;
# the backend serves it (standalone mode, see backend/src/standalone.ts).
set -e
cd "$(dirname "$0")/.."
bun deploy/b64-restore.ts
bun install --frozen-lockfile
cd backend
export NODE_ENV=production HOST=0.0.0.0 PORT="${SERVER_PORT:-8787}" STATIC_DIR=../frontend/dist
exec bun src/index.ts
