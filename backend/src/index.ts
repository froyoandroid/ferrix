import { Hono } from "hono";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { RenderRequest, ThreadRenderRequest } from "@ferrix/shared";
import { renderPng, renderThread } from "./renderer";
import { zipImages } from "./export/zip";
import { extract, ExtractError } from "./adapters";
import { z } from "zod";
import { fileBase } from "./naming";
import { renderMp4, VideoError } from "./video/animate";

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
    const { post, options } = parsed.data;
    return png(await renderPng(post, options), `${fileBase(post, options.maskUsername)}_${options.theme}.png`, post.sourceUrl);
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
    return new Response(new Uint8Array(zipImages(images, posts.map((p) => p.sourceUrl))), {
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

app.post("/api/render/video", async (c) => {
  const parsed = RenderRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const { post, options } = parsed.data;
  try {
    const mp4 = await renderMp4(post, options);
    return new Response(new Uint8Array(mp4), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="${fileBase(post, options.maskUsername)}_${options.theme}.mp4"`,
        "X-Ferrix-Source-Url": encodeURI(post.sourceUrl),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof VideoError) return c.json({ error: err.message }, err.status);
    if (err instanceof Error && /Platform/.test(err.message)) return c.json({ error: err.message }, 422);
    throw err;
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
