import { SCRIPT_FAMILIES, SUBSET_FAMILIES } from "@ferrix/render";

/**
 * Script fonts (Noto, OFL) as per-text subsets from Google Fonts: a CJK post needs a few KB of
 * glyphs instead of a 10+ MB font. Requested without a User-Agent, the CSS API answers with TrueType,
 * which the layout engine reads. Only allowlisted families, only fonts.gstatic.com files.
 */
const MAX_TEXT = 200;
const cache = new Map<string, Promise<ArrayBuffer | null>>();
let cacheBytes = 0;
const CACHE_MAX = 64 * 1024 * 1024;
const sizes = new Map<string, number>();

export class FontRejected extends Error {}

export function scriptFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  const weights = SCRIPT_FAMILIES[family];
  if (!weights || !weights.includes(weight)) return Promise.reject(new FontRejected("Unknown font"));
  // CJK: a per-text subset (required). Other scripts: the whole font (no text).
  if (SUBSET_FAMILIES.has(family) ? !text || [...text].length > MAX_TEXT : text) return Promise.reject(new FontRejected("Bad text"));
  const key = `${family}|${weight}|${text}`;
  let p = cache.get(key);
  if (p) {
    cache.delete(key);
    cache.set(key, p);
    return p;
  }
  p = load(family, weight, text);
  cache.set(key, p);
  p.then((buf) => {
    if (!buf) return cache.delete(key);
    sizes.set(key, buf.byteLength);
    cacheBytes += buf.byteLength;
    while (cacheBytes > CACHE_MAX && cache.size > 1) {
      const k = cache.keys().next().value as string;
      cache.delete(k);
      cacheBytes -= sizes.get(k) ?? 0;
      sizes.delete(k);
    }
  }, () => cache.delete(key));
  return p;
}

async function load(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}${text ? `&text=${encodeURIComponent(text)}` : ""}`,
    { signal: AbortSignal.timeout(8000) },
  );
  if (!css.ok) return null;
  const url = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)\s*format\('(?:truetype|opentype)'\)/.exec(await css.text())?.[1];
  if (!url) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: "error" });
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  return buf.byteLength > 8 * 1024 * 1024 ? null : buf;
}
