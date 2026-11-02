import { Hono } from "hono";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { RenderRequest, ThreadRenderRequest } from "@ferrix/shared";
import { renderPng, renderThread } from "./renderer";
import { zipImages } from "./export/zip";

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
      "X-Ferrix-Source-Url": encodeURI(sourceUrl),
      "Cache-Control": "no-store",
    },
  });

app.post("/api/render", async (c) => {
  const parsed = RenderRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  try {
    return png(await renderPng(parsed.data.post, parsed.data.options), "ferrix.png", parsed.data.post.sourceUrl);
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
        "Content-Disposition": `attachment; filename="ferrix-thread.zip"`,
        "X-Ferrix-Count": String(images.length),
        "Cache-Control": "no-store",
      },
    });
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
