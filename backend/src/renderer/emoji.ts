import { dirname, join } from "node:path";

/** Twemoji SVGs bundled from @twemoji/svg, served to Satori as data URIs (no network at render time). */
const DIR = dirname(Bun.fileURLToPath(import.meta.resolve("@twemoji/svg/package.json")));
const cache = new Map<string, string | null>();

function toCode(seg: string, keepVS: boolean) {
  const s = keepVS ? seg : seg.replace(/\uFE0F/g, "");
  return [...s].map((c) => c.codePointAt(0)!.toString(16)).join("-");
}

export async function emojiDataUri(segment: string): Promise<string | null> {
  if (cache.has(segment)) return cache.get(segment)!;
  let uri: string | null = null;
  for (const code of new Set([toCode(segment, segment.includes("\u200d")), toCode(segment, true), toCode(segment, false)])) {
    const file = Bun.file(join(DIR, `${code}.svg`));
    if (await file.exists()) {
      uri = `data:image/svg+xml;base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
      break;
    }
  }
  cache.set(segment, uri);
  return uri;
}
