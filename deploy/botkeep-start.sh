#!/bin/sh
# Botkeep start command: sh deploy/botkeep-start.sh
# Botkeep source ZIPs must be text only, so binary assets (fonts) ship as
# <file>.b64.NN parts and are decoded here. The archive also ships a prebuilt frontend/dist;
# the backend serves it (standalone mode, see backend/src/standalone.ts).
set -e
cd "$(dirname "$0")/.."
bun -e '
const parts = new Map();
for await (const f of new Bun.Glob("**/*.b64.*").scan({ cwd: "." })) {
  if (f.startsWith("node_modules/")) continue;
  const i = f.lastIndexOf(".b64.");
  const out = f.slice(0, i);
  (parts.get(out) ?? parts.set(out, []).get(out)).push(f);
}
for (const [out, fs] of parts) {
  fs.sort();
  let b64 = "";
  for (const f of fs) b64 += await Bun.file(f).text();
  await Bun.write(out, Buffer.from(b64, "base64"));
}'
bun install --frozen-lockfile
cd backend
export NODE_ENV=production HOST=0.0.0.0 PORT="${SERVER_PORT:-8787}" STATIC_DIR=../frontend/dist
exec bun src/index.ts
