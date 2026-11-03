import { NormalizedPost, type AttributionPreset, type ThreadMode } from "@ferrix/shared";
import { z } from "zod";

export type Post = z.infer<typeof NormalizedPost>;
export type ThemeId = "light" | "dark" | "ferrix";
export type Logo = "x" | "twitter" | "none";

export const Input = z.union([NormalizedPost, z.array(NormalizedPost).min(1)]);

export interface Settings {
  theme: ThemeId;
  attribution: AttributionPreset;
  showDate: boolean;
  showMetrics: boolean;
  logo: Logo;
  maskUsername: boolean;
  width: number;
  scale: number;
  mode: ThreadMode;
  numbering: boolean;
  maxHeight: number;
  format: "png" | "webp";
  mediaAspect: "auto" | "16:9" | "3:2" | "1:1" | "4:5";
  altText: "off" | "badge" | "caption";
  postsPerImage: number;
}

export const defaultSettings: Settings = {
  theme: "light",
  attribution: "original",
  showDate: true,
  showMetrics: false,
  logo: "x",
  maskUsername: false,
  width: 600,
  scale: 2,
  mode: "combined",
  numbering: true,
  maxHeight: 3200,
  format: "png",
  mediaAspect: "auto",
  altText: "badge",
  postsPerImage: 0,
};

/**
 * Everything the editor needs to come back to a post without fetching it again.
 * `order` holds indexes into `posts`; `selected` is indexed like `posts`.
 */
export interface Draft {
  posts: Post[];
  order: number[];
  selected: boolean[];
  settings: Settings;
  savedAt: string;
  /** When the posts were fetched from the platform; absent for posts typed in as JSON. */
  extractedAt?: string;
}

export function freshDraft(posts: Post[], settings: Settings = defaultSettings, extracted = false): Draft {
  const now = new Date().toISOString();
  return { posts, order: posts.map((_, i) => i), selected: posts.map(() => true), settings, savedAt: now, ...(extracted ? { extractedAt: now } : {}) };
}

const KEY = "ferrix.draft.v1";

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    const posts = z.array(NormalizedPost).min(1).parse(d.posts);
    const n = posts.length;
    const order = Array.isArray(d.order) && d.order.length === n && new Set(d.order).size === n && d.order.every((i) => i >= 0 && i < n) ? d.order : posts.map((_, i) => i);
    const selected = Array.isArray(d.selected) && d.selected.length === n ? d.selected.map(Boolean) : posts.map(() => true);
    return { posts, order, selected, settings: { ...defaultSettings, ...d.settings }, savedAt: d.savedAt, extractedAt: typeof d.extractedAt === "string" ? d.extractedAt : undefined };
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...d, savedAt: new Date().toISOString() }));
  } catch {
    /* storage full or disabled: drafts are best effort */
  }
}

export const api = (path: string, body: unknown, signal?: AbortSignal) =>
  fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });

export async function errorText(res: Response) {
  const body = await res.text();
  try {
    const j = JSON.parse(body);
    return typeof j.error === "string" ? j.error : JSON.stringify(j.error ?? j);
  } catch {
    return body || `Request failed (${res.status})`;
  }
}

/** Filename from the server's Content-Disposition, so downloads carry the post's identity. */
export function fileName(res: Response, fallback: string) {
  return /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;
}

export function svgSize(svg: string) {
  const w = Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 0);
  const h = Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 0);
  return { w, h };
}

/** Small LRU of preview SVG blob URLs, so flipping a setting back is instant and costs no request. */
export class PreviewCache {
  private map = new Map<string, PreviewImage[]>();
  constructor(private max = 40) {}
  get(key: string) {
    const v = this.map.get(key);
    if (v) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: string, v: PreviewImage[]) {
    this.map.set(key, v);
    while (this.map.size > this.max) {
      const [k, old] = this.map.entries().next().value as [string, PreviewImage[]];
      this.map.delete(k);
      old.forEach((p) => URL.revokeObjectURL(p.url));
    }
  }
}

export interface PreviewImage {
  url: string;
  w: number;
  h: number;
}

export function svgUrl(svg: string): PreviewImage {
  return { url: URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), ...svgSize(svg) };
}

export function move<T>(arr: T[], from: number, to: number) {
  const a = [...arr];
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}
