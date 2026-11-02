import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NormalizedPost, RenderOptions } from "@ferrix/shared";
import { renderRgba, resolveFor } from "../renderer";
import { KEY_RGB, type ResolvedPost } from "../renderer/resolve";
import { fetchVideo } from "./fetch";

const MAX_SECONDS = 140; // X's standard upload limit
const ENCODE_TIMEOUT_MS = 150_000;
const MAX_CONCURRENT = 2;
const MAX_QUEUE = 6;

export class VideoError extends Error {
  constructor(message: string, readonly status: 400 | 422 | 503 = 422) {
    super(message);
  }
}

// Tiny semaphore so encodes can't pile up and starve the box.
let running = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    if (waiting.length >= MAX_QUEUE) throw new VideoError("Video encoder busy, try again shortly", 503);
    await new Promise<void>((r) => waiting.push(r));
  }
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

type Target = { inQuote: boolean; idx: number };
const playable = (media: NormalizedPost["content"]["media"]) => media.findIndex((m) => m.type !== "image" && m.videoUrl);

/** First playable clip: the post's own media, else the quoted post's. */
export function animatedTarget(post: NormalizedPost): Target | null {
  const own = playable(post.content.media);
  if (own >= 0) return { inQuote: false, idx: own };
  const q = post.quote ? playable(post.quote.content.media) : -1;
  return q >= 0 ? { inQuote: true, idx: q } : null;
}

function withKey(r: ResolvedPost, t: Target): ResolvedPost {
  const mark = <T extends { resolvedMedia: ResolvedPost["resolvedMedia"] }>(x: T): T => ({
    ...x,
    resolvedMedia: x.resolvedMedia.map((m, i) => (i === t.idx ? { ...m, key: true } : m)),
  });
  if (!t.inQuote) return mark(r);
  return { ...r, resolvedQuote: r.resolvedQuote && mark(r.resolvedQuote) };
}

/**
 * Card as MP4: render the card twice (normal, and with the video slot painted a key colour),
 * punch the key pixels out of the normal render, and lay it over the scaled video with ffmpeg.
 * Anti-aliased rounded corners stay correct because edge pixels keep the normal render's colour.
 */
export async function renderMp4(post: NormalizedPost, options: RenderOptions): Promise<Uint8Array> {
  const target = animatedTarget(post);
  if (!target) throw new VideoError("This post has no video or GIF", 400);
  const m = (target.inQuote ? post.quote!.content.media : post.content.media)[target.idx];

  return slot(async () => {
    const resolved = await resolveFor(post, options);
    const [normal, keyed, video] = await Promise.all([
      renderRgba(resolved, options),
      renderRgba(withKey(resolved, target), options),
      fetchVideo(m.videoUrl!),
    ]);
    const { width: W, height: H } = normal;
    const overlay = normal.pixels;
    const k = keyed.pixels;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4;
        if (Math.abs(k[o] - KEY_RGB[0]) <= 2 && Math.abs(k[o + 1] - KEY_RGB[1]) <= 2 && Math.abs(k[o + 2] - KEY_RGB[2]) <= 2) {
          overlay[o + 3] = 0;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) throw new VideoError("Could not place the video in the card");
    const vw = x1 - x0 + 1, vh = y1 - y0 + 1;

    const dir = await mkdtemp(join(tmpdir(), "ferrix-"));
    try {
      const vin = join(dir, "in.mp4"), ov = join(dir, "overlay.rgba"), out = join(dir, "out.mp4");
      await Promise.all([writeFile(vin, video), writeFile(ov, overlay)]);
      const loops = m.type === "gif" && m.durationMs && m.durationMs < 5000 ? Math.ceil(5000 / m.durationMs) - 1 : 0;
      const filter = [
        `[0:v]scale=${vw}:${vh}:force_original_aspect_ratio=increase,crop=${vw}:${vh},setsar=1,pad=${W}:${H}:${x0}:${y0}:color=black[v]`,
        `[v][1:v]overlay=0:0:format=auto,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p[out]`,
      ].join(";");
      const args = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        ...(loops ? ["-stream_loop", String(loops)] : []),
        "-i", vin,
        "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-i", ov,
        "-filter_complex", filter,
        "-map", "[out]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-threads", "8",
        "-c:a", "aac", "-b:a", "128k",
        "-t", String(MAX_SECONDS), "-movflags", "+faststart",
        out,
      ];
      const proc = Bun.spawn(args, { stdout: "ignore", stderr: "pipe" });
      const timer = setTimeout(() => proc.kill(), ENCODE_TIMEOUT_MS);
      const code = await proc.exited;
      clearTimeout(timer);
      if (code !== 0) {
        console.error("ffmpeg failed:", (await new Response(proc.stderr).text()).slice(-800));
        throw new VideoError("Video encoding failed");
      }
      return new Uint8Array(await readFile(out));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
