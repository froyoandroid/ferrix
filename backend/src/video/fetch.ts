/**
 * Safe MP4 downloader for animated export. Same posture as the image loader:
 * https only, exact host allowlist, no redirects, timeout, size cap, container sniff.
 */
const HOSTS = new Set(
  (process.env.FERRIX_VIDEO_HOSTS ?? "video.twimg.com").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),
);
const MAX_BYTES = 100 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

export async function fetchVideo(url: string): Promise<Uint8Array> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !HOSTS.has(u.hostname.toLowerCase())) throw new Error("Video host not allowed");
  const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status !== 200 || !res.body) throw new Error(`Video fetch failed (${res.status})`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("Video too large");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > MAX_BYTES) throw new Error("Video too large");
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.byteLength;
  }
  // ISO-BMFF: "ftyp" box at offset 4.
  if (String.fromCharCode(...bytes.subarray(4, 8)) !== "ftyp") throw new Error("Not an MP4 file");
  return bytes;
}
