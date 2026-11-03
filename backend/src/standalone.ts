// Standalone mode: the backend serves the built frontend and enforces its own
// rate limits, for hosts with no nginx in front (e.g. Botkeep).
// Enabled when STATIC_DIR is set. Mirrors deploy/nginx-ferrix.conf.
import type { Hono, MiddlewareHandler } from "hono";
import { serveStatic } from "hono/bun";

export const STATIC_DIR = process.env.STATIC_DIR ?? "";

const CSP =
  "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";

function clientIp(h: (k: string) => string | undefined): string {
  return (
    h("cf-connecting-ip") ??
    h("x-real-ip") ??
    h("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

type Bucket = { tokens: number; at: number };

/** Token bucket per client IP: `perMinute` refill, `burst` extra capacity (like nginx burst+nodelay). */
function limiter(perMinute: number, burst: number): MiddlewareHandler {
  const buckets = new Map<string, Bucket>();
  const cap = burst + 1;
  const perMs = perMinute / 60_000;
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.tokens + (now - b.at) * perMs >= cap) buckets.delete(k);
  }, 60_000).unref?.();
  return async (c, next) => {
    const ip = clientIp((k) => c.req.header(k));
    const now = Date.now();
    const b = buckets.get(ip) ?? { tokens: cap, at: now };
    b.tokens = Math.min(cap, b.tokens + (now - b.at) * perMs);
    b.at = now;
    if (b.tokens < 1) {
      buckets.set(ip, b);
      return c.json({ error: "Too many requests" }, 429, { "Retry-After": "5" });
    }
    b.tokens -= 1;
    buckets.set(ip, b);
    await next();
  };
}

/** Call before API routes. */
export function standaloneBefore(app: Hono) {
  if (!STATIC_DIR) return;
  const assets = limiter(600, 120);
  const preview = limiter(240, 60);
  const render = limiter(30, 10);
  app.use("/api/*", async (c, next) => {
    const p = c.req.path;
    if (p === "/api/health") return next();
    if (/^\/api\/(img|emoji|font)$/.test(p)) return assets(c, next);
    if (p.startsWith("/api/preview")) return preview(c, next);
    return render(c, next);
  });
  app.use("*", async (c, next) => {
    await next();
    if (c.req.path.startsWith("/api/")) return;
    c.header("Content-Security-Policy", CSP);
    c.header("X-Frame-Options", "SAMEORIGIN");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Strict-Transport-Security", "max-age=15552000");
    if (c.req.path.startsWith("/assets/")) c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
}

/** Call after API routes: static files with SPA fallback. */
export function standaloneAfter(app: Hono) {
  if (!STATIC_DIR) return;
  app.notFound((c) => (c.req.path.startsWith("/api/") ? c.json({ error: "Not found" }, 404) : c.text("Not found", 404)));
  const files = serveStatic({ root: STATIC_DIR });
  const spa = serveStatic({ root: STATIC_DIR, path: "index.html" });
  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : files(c, next)));
  app.get("*", (c, next) => (c.req.path.startsWith("/api/") ? next() : spa(c, next)));
}
