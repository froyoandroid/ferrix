#!/usr/bin/env bash
# Build the frontend and pack a Botkeep source ZIP to /tmp/ferrix-botkeep.zip.
# Botkeep accepts text-only ZIPs (<=200 files, <=5 MB uncompressed), so binary
# files are base64-encoded as <file>.b64; deploy/botkeep-start.sh decodes them.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile
bun run --filter @ferrix/frontend build
work=$(mktemp -d)
git archive HEAD | tar -x -C "$work"
cp -r frontend/dist "$work/frontend/dist"
cd "$work"
find . -type f | while read -r f; do
  if [ "$(file -b --mime-encoding "$f")" = "binary" ]; then base64 -w0 "$f" > "$f.b64"; rm "$f"; fi
done
rm -f /tmp/ferrix-botkeep.zip
zip -qr9 /tmp/ferrix-botkeep.zip .
echo "files: $(find . -type f | wc -l)  bytes: $(du -sb . | cut -f1)"
cd / && rm -rf "$work"
ls -l /tmp/ferrix-botkeep.zip
