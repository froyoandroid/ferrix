import { Hono } from "hono";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { RenderRequest, ThreadRenderRequest } from "@ferrix/shared";
import { previewThread, renderPng, renderSvg, renderThread } from "./renderer";
import { fileBase, zipImages } from "@ferrix/render";
import { extract, ExtractError } from "./adapters";
import { z } from "zod";
import { fetchSafeImage, ImageRejected, MIME, type FetchedImage } from "./renderer/images";
import { emojiDataUri } from "./renderer/emoji";

const app = new Hono();
app.use("*", logger());
app.use("*", secureHeaders());
app.use("/api/*", bodyLimit({ maxSize: 4 * 1024 * 1024, onError: (c) => c.json({ error: "Request too large" }, 413) }));

app.get("/api/health", (c) => c.json({ ok: true }));

const png = (bytes: Uint8Array, name: string, sourceUrl: string) =>
  new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="${name}"`,
      "Access-Control-Expose-Headers": "Content-Disposition",
      "X-Ferrix-Source-Url": encodeURI(sourceUrl),
      "Cache-Control": "no-store",
    },
  });

const ExtractRequest = z.object({ url: z.string().url().max(2048), thread: z.boolean().default(false) });
const extractStatus = { unsupported_url: 400, not_found: 404, unavailable: 404, rate_limited: 429, upstream_error: 502 } as const;

app.post("/api/extract", async (c) => {
  const parsed = ExtractRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Provide a post URL" }, 400);
  try {
    return c.json({ posts: await extract(parsed.data.url, { thread: parsed.data.thread }) });
  } catch (err) {
    if (err instanceof ExtractError) return c.json({ error: err.message, code: err.code }, extractStatus[err.code]);
    throw err;
  }
});

app.post("/api/render", async (c) => {
  const parsed = RenderRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  try {
    const { post, options, badge } = parsed.data;
    return png(await renderPng(post, options, badge), `${fileBase(post, options.maskUsername)}_${options.theme}.png`, post.sourceUrl);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 422);
  }
});

app.post("/api/render/thread", async (c) => {
  const parsed = ThreadRenderRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { posts, ...opts } = parsed.data;
  try {
    const images = await renderThread(posts, opts);
    if (images.length === 1) return png(images[0].png, images[0].name, posts[0].sourceUrl);
    return new Response(new Uint8Array(zipImages(images.map((i) => ({ name: i.name, data: i.png })), posts.map((p) => p.sourceUrl))), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileBase(posts[0], opts.options.maskUsername)}_thread.zip"`,
        "X-Ferrix-Count": String(images.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 422);
  }
});

// Image proxy for the browser renderer. All safety rules live in fetchSafeImage (allowlist, DNS/IP
// checks, re-validated redirects, MIME + magic bytes, size and time caps). Small in-memory LRU.
const imgCache = new Map<string, FetchedImage>();
let imgCacheBytes = 0;
const IMG_CACHE_MAX = 96 * 1024 * 1024;

app.get("/api/img", async (c) => {
  const url = c.req.query("u");
  if (!url || url.length > 2048) return c.json({ error: "Missing image url" }, 400);
  let img = imgCache.get(url);
  if (img) {
    imgCache.delete(url);
    imgCache.set(url, img);
  } else {
    try {
      img = await fetchSafeImage(url);
    } catch (err) {
      if (err instanceof ImageRejected) return c.json({ error: err.message }, 403);
      return c.json({ error: "Image unavailable" }, 502);
    }
    imgCache.set(url, img);
    imgCacheBytes += img.bytes.byteLength;
    while (imgCacheBytes > IMG_CACHE_MAX) {
      const [k, old] = imgCache.entries().next().value as [string, FetchedImage];
      imgCache.delete(k);
      imgCacheBytes -= old.bytes.byteLength;
    }
  }
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      "Content-Type": MIME[img.kind],
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Disposition": "inline",
    },
  });
});

// Twemoji for the browser renderer, as a data URI (bundled files only, no network).
app.get("/api/emoji", async (c) => {
  const seg = c.req.query("s") ?? "";
  if (!seg || [...seg].length > 16) return c.text("", 400);
  const uri = await emojiDataUri(seg);
  if (!uri) return c.text("", 404);
  return c.text(uri, 200, { "Cache-Control": "public, max-age=604800, immutable" });
});

// Live previews: layout only, returned as SVG for the browser to draw (rasterizing is ~95% of render cost).
const svgHeaders = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
  "Cache-Control": "no-store",
};

app.post("/api/preview", async (c) => {
  const parsed = RenderRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  try {
    const { post, options, badge } = parsed.data;
    return new Response(await renderSvg(post, options, badge), { headers: svgHeaders });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 422);
  }
});

app.post("/api/preview/thread", async (c) => {
  const parsed = ThreadRenderRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { posts, ...opts } = parsed.data;
  try {
    return c.json({ segments: await previewThread(posts, opts) }, 200, { "Cache-Control": "no-store" });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 422);
  }
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

const port = Number(process.env.PORT ?? 8787);
const hostname = process.env.HOST ?? "127.0.0.1";
console.log(`ferrix backend on ${hostname}:${port}`);
export default { port, hostname, fetch: app.fetch };
