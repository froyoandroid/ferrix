import { imageSize } from "image-size";

/**
 * Safe remote image loader. Images are fetched server-side, so every rule here
 * exists to stop the renderer being used as an open proxy / SSRF vector:
 * https only, exact host allowlist, no redirects, timeout, size cap, magic-byte check.
 */

const DEFAULT_HOSTS = ["pbs.twimg.com", "abs.twimg.com"];
const ALLOWED_HOSTS = new Set(
  (process.env.FERRIX_IMAGE_HOSTS ?? DEFAULT_HOSTS.join(","))
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 8_000;
const CACHE_MAX = 200;

export interface LoadedImage {
  src: string; // data URI
  width: number;
  height: number;
}

type Kind = "png" | "jpeg" | "gif" | "webp" | "svg";
const MIME: Record<Kind, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function sniff(b: Uint8Array): Kind | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  )
    return "webp";
  return null;
}

const cache = new Map<string, Promise<LoadedImage | null>>();

export function loadImage(url: string | undefined): Promise<LoadedImage | null> {
  if (!url) return Promise.resolve(null);
  const hit = cache.get(url);
  if (hit) return hit;
  const p = doLoad(url).catch(() => null);
  cache.set(url, p);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return p;
}

async function doLoad(url: string): Promise<LoadedImage | null> {
  let bytes: Uint8Array;
  let kind: Kind | null;

  if (url.startsWith("data:")) {
    const m = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!m || m[2].length > MAX_BYTES * 1.4) return null;
    bytes = Uint8Array.from(Buffer.from(m[2], "base64"));
    kind = m[1] === "svg+xml" ? "svg" : sniff(bytes);
  } else {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return null;

    const res = await fetch(u, {
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "FerrixRenderer/0.1", Accept: "image/*" },
    });
    if (!res.ok || !res.body) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;

    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.byteLength;
      if (total > MAX_BYTES) return null;
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
    kind = sniff(bytes); // remote SVG is never accepted
  }

  if (!kind) return null;
  const dim = imageSize(bytes);
  if (!dim.width || !dim.height) return null;
  return {
    src: `data:${MIME[kind]};base64,${Buffer.from(bytes).toString("base64")}`,
    width: dim.width,
    height: dim.height,
  };
}
