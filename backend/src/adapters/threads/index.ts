import { parse, type HTMLElement } from "node-html-parser";
import { LIMITS } from "@ferrix/shared";
import type { MediaItem, NormalizedPost } from "@ferrix/shared";
import { ExtractError } from "../errors";

/**
 * Threads adapter, no login and no API token: reads the public embed page Meta serves for
 * every public post (/@user/post/CODE/embed), which is plain server-rendered HTML.
 * - The exact post time is not in the embed, but Threads shortcodes encode the media id, whose
 *   high bits are milliseconds since Instagram's epoch, so the timestamp is decoded from the code.
 * - Meta throttles datacenter IPs per host, so threads.com and threads.net are both tried.
 * - Results are cached to keep repeat extractions off Meta entirely.
 */

const HOSTS = new Set(["threads.com", "www.threads.com", "threads.net", "www.threads.net"]);
const CODE_RE = /^[A-Za-z0-9_-]{5,32}$/;
const USER_RE = /^[A-Za-z0-9._]{1,30}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const IG_EPOCH_MS = 1314220021721n;

export function parseThreadsUrl(raw: string): { user: string; code: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(u.protocol) || !HOSTS.has(u.hostname.toLowerCase())) return null;
  const m = /^\/@([^/]+)\/post\/([^/?#]+)/.exec(u.pathname);
  if (!m || !USER_RE.test(m[1]) || !CODE_RE.test(m[2])) return null;
  return { user: m[1], code: m[2] };
}

export function decodeShortcode(code: string): { id: string; timestamp: string } | null {
  let n = 0n;
  for (const ch of code) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) return null;
    n = n * 64n + BigInt(i);
  }
  const ms = (n >> 23n) + IG_EPOCH_MS;
  const d = new Date(Number(ms));
  // Sanity window: Threads launched in 2023; reject codes that decode to nonsense.
  if (d.getUTCFullYear() < 2023 || d.getTime() > Date.now() + 86_400_000) return { id: n.toString(), timestamp: "" };
  return { id: n.toString(), timestamp: d.toISOString() };
}

/** "3.1K" -> 3100, "1,234" -> 1234. Threads only shows rounded counts. */
export function parseCount(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = /^([\d.,]+)\s*([KMB])?$/i.exec(s.trim());
  if (!m) return undefined;
  const base = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(base)) return undefined;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? "").toUpperCase() as "K" | "M" | "B"] ?? 1;
  return Math.round(base * mult);
}

const UA = "Mozilla/5.0 (compatible; FerrixBot/0.1; +https://ferrix.overzealous.tech)";
const TIMEOUT_MS = 10_000;
const cache = new Map<string, { at: number; post: NormalizedPost }>();
const CACHE_TTL = 15 * 60_000;

async function fetchEmbed(user: string, code: string): Promise<string> {
  let sawThrottle = false;
  let sawMissing = false;
  for (const host of ["www.threads.com", "www.threads.net"]) {
    let res: Response;
    try {
      res = await fetch(`https://${host}/@${user}/post/${code}/embed`, {
        headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.8" },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      continue;
    }
    const html = res.ok || res.status === 404 ? await res.text() : "";
    if (res.ok && html.includes("BodyContainer")) return html;
    if (res.status === 429 || (res.status === 404 && html.length > 150_000)) sawThrottle = true; // generic error shell = throttled
    else sawMissing = true;
  }
  if (sawThrottle && !sawMissing) throw new ExtractError("rate_limited", "Threads is limiting requests right now. Try again in a minute.");
  if (sawMissing) throw new ExtractError("not_found", "This Threads post is private, deleted, or not embeddable");
  throw new ExtractError("upstream_error", "Could not reach Threads");
}

function textOf(el: HTMLElement | null): string {
  if (!el) return "";
  // Keep line breaks; node-html-parser's .text decodes entities.
  return el.text.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
}

function mediaFrom(root: HTMLElement): MediaItem[] {
  const out: MediaItem[] = [];
  const containers = root.querySelectorAll("[class*=Media]");
  const seen = new Set<string>();
  for (const c of containers) {
    for (const v of c.querySelectorAll("video")) {
      // The embed often ships no poster; keep the video as a placeholder the editor can give a still.
      const poster = v.getAttribute("poster") ?? undefined;
      const key = poster ?? v.querySelector("source")?.getAttribute("src") ?? v.toString().slice(0, 200);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(poster && /^https:\/\//.test(poster) ? { type: "video", thumbnailUrl: poster } : { type: "video" });
    }
    for (const img of c.querySelectorAll("img")) {
      const src = img.getAttribute("src");
      if (!src || seen.has(src) || !/^https:\/\//.test(src)) continue;
      seen.add(src);
      const alt = img.getAttribute("alt")?.trim();
      out.push({ type: "image", url: src, ...(alt ? { altText: alt.slice(0, 2000) } : {}) });
    }
  }
  return out.slice(0, LIMITS.mediaPerPost);
}

export function parseEmbed(html: string, user: string, code: string): NormalizedPost {
  const root = parse(html);
  const body = root.querySelector(".BodyTextContainer") ?? root.querySelector(".TextContentContainer");
  const username = textOf(root.querySelector(".HeaderLink span")) || user;
  const avatar = root.querySelector(".AvatarContainer img")?.getAttribute("src");
  const counts = root.querySelectorAll(".ActionBarCount").map((e) => parseCount(textOf(e)));
  const decoded = decodeShortcode(code);
  const media = mediaFrom(root);
  const text = textOf(body);
  if (!text && !media.length) throw new ExtractError("unavailable", "This Threads post has no content Ferrix can show");

  const metrics = { likes: counts[0], replies: counts[1], reposts: counts[2], shares: counts[3] };
  return {
    platform: "threads",
    sourceUrl: `https://www.threads.com/@${username}/post/${code}`,
    postId: code,
    author: {
      username,
      ...(avatar && /^https:\/\//.test(avatar) ? { avatarUrl: avatar } : {}),
      verified: root.querySelector(".VerifiedBadge") ? true : undefined,
    },
    content: { text, media },
    ...(counts.some((c) => c !== undefined) ? { metrics } : {}),
    ...(decoded?.timestamp ? { timestamp: decoded.timestamp } : {}),
  };
}

export async function extractThreads(url: string): Promise<NormalizedPost[]> {
  const ref = parseThreadsUrl(url);
  if (!ref) throw new ExtractError("unsupported_url", "Not a Threads post URL");
  const key = ref.code;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return [hit.post];
  const post = parseEmbed(await fetchEmbed(ref.user, ref.code), ref.user, ref.code);
  cache.set(key, { at: Date.now(), post });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return [post];
}
