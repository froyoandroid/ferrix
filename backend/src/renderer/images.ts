import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { imageSize } from "image-size";
import type { LoadedImage } from "@ferrix/render";

/**
 * Safe remote image fetcher, shared by the server renderer and the /api/img proxy the browser
 * renderer uses. Every rule exists to stop Ferrix being an open proxy or an SSRF vector:
 * - https only, default port, no credentials, exact host allowlist
 * - the host's addresses are resolved and any private, loopback, link-local or reserved IP is refused
 * - redirects are followed manually (max 3) and every hop is checked again
 * - declared Content-Type must be a raster image, and the bytes must match it (magic-byte sniff); no SVG
 * - timeout and size cap enforced while streaming
 */

// Exact hosts, or "*.suffix" for a CDN's numbered edge hosts (Threads images come from
// scontent-<pop>.cdninstagram.com and scontent-<pop>.xx.fbcdn.net).
const DEFAULT_HOSTS = ["pbs.twimg.com", "abs.twimg.com", "*.cdninstagram.com", "*.fbcdn.net"];
const ALLOWED_HOSTS = new Set(
  (process.env.FERRIX_IMAGE_HOSTS ?? DEFAULT_HOSTS.join(","))
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;
const CACHE_MAX = 200;

export type Kind = "png" | "jpeg" | "gif" | "webp";
export const MIME: Record<Kind, string> = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const DECLARED: Record<string, Kind> = { "image/png": "png", "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/gif": "gif", "image/webp": "webp" };

export class ImageRejected extends Error {}

export function hostAllowed(host: string): boolean {
  if (ALLOWED_HOSTS.has(host)) return true;
  for (const h of ALLOWED_HOSTS) {
    if (!h.startsWith("*.")) continue;
    const suffix = h.slice(1); // ".cdninstagram.com"
    if (host.endsWith(suffix) && /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host.slice(0, -suffix.length))) return true;
  }
  return false;
}

export function sniff(b: Uint8Array): Kind | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return "webp";
  return null;
}

/** True for any address a public image CDN should never resolve to. */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT, includes Tailscale
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff") || v6.startsWith("64:ff9b") || v6.startsWith("2001:db8");
}

async function checkUrl(raw: string | URL): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ImageRejected("invalid url");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) throw new ImageRejected("only plain https urls");
  const host = u.hostname.toLowerCase();
  if (!hostAllowed(host)) throw new ImageRejected("host not allowed");
  const addrs = await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new ImageRejected("host resolves to a non-public address");
  return u;
}

export interface FetchedImage {
  bytes: Uint8Array;
  kind: Kind;
}

export async function fetchSafeImage(url: string): Promise<FetchedImage> {
  let u = await checkUrl(url);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; ; hop++) {
    const res = await fetch(u, { redirect: "manual", signal, headers: { "User-Agent": "FerrixRenderer/0.1", Accept: "image/*" } });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || hop >= MAX_REDIRECTS) throw new ImageRejected("too many redirects");
      u = await checkUrl(new URL(loc, u));
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`upstream ${res.status}`);
    const declared = DECLARED[(res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()];
    if (!declared) throw new ImageRejected("not a raster image");
    if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new ImageRejected("too large");

    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.byteLength;
      if (total > MAX_IMAGE_BYTES) throw new ImageRejected("too large");
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(Buffer.concat(chunks));
    const kind = sniff(bytes);
    if (!kind || kind !== declared) throw new ImageRejected("content does not match its type");
    return { bytes, kind };
  }
}

const cache = new Map<string, Promise<LoadedImage | null>>();

/** Renderer image loader: data URIs (from user JSON) or allowlisted remote images, as data URIs. */
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
  let mime: string;
  if (url.startsWith("data:")) {
    const m = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!m || m[2].length > MAX_IMAGE_BYTES * 1.4) return null;
    bytes = Uint8Array.from(Buffer.from(m[2], "base64"));
    if (m[1] === "svg+xml") mime = "image/svg+xml";
    else {
      const k = sniff(bytes);
      if (!k) return null;
      mime = MIME[k];
    }
  } else {
    const img = await fetchSafeImage(url);
    bytes = img.bytes;
    mime = MIME[img.kind];
  }
  const dim = imageSize(bytes);
  if (!dim.width || !dim.height) return null;
  return { src: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`, width: dim.width, height: dim.height };
}
