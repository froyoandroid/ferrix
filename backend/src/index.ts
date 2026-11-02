import { Hono } from "hono";
import { logger } from "hono/logger";
import { RenderRequest } from "@ferrix/shared";
import { renderPng } from "./renderer";

const app = new Hono();
app.use("*", logger());

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/render", async (c) => {
  const parsed = RenderRequest.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  try {
    const png = await renderPng(parsed.data.post, parsed.data.options);
    return c.body(new Uint8Array(png), 200, {
      "Content-Type": "image/png",
      "X-Ferrix-Source-Url": parsed.data.post.sourceUrl,
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 422);
  }
});

const port = Number(process.env.PORT ?? 8787);
console.log(`ferrix backend on :${port}`);
export default { port, fetch: app.fetch };
