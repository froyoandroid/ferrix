#!/bin/sh
# Botkeep start command: sh deploy/botkeep-start.sh
# Botkeep source ZIPs must be text only, so binary assets (fonts) ship as
# <file>.b64 and are decoded here. The archive also ships a prebuilt frontend/dist;
# the backend serves it (standalone mode, see backend/src/standalone.ts).
set -e
cd "$(dirname "$0")/.."
bun -e '
const { Glob } = Bun;
for await (const f of new Glob("**/*.b64").scan({ cwd: ".", dot: false })) {
  if (f.startsWith("node_modules/")) continue;
  const out = f.slice(0, -4);
  await Bun.write(out, Buffer.from(await Bun.file(f).text(), "base64"));
}'
bun install --frozen-lockfile
cd backend
export NODE_ENV=production HOST=0.0.0.0 PORT="${SERVER_PORT:-8787}" STATIC_DIR=../frontend/dist
exec bun src/index.ts
