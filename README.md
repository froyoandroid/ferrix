# Ferrix

> The message outlives the messenger.

Turns public social posts (X, Threads; Facebook later) into standalone images you can download and post fresh.

## Layout

- `shared/` – Zod schemas and types (normalized post model, render options)
- `backend/` – Bun + Hono API; renderer (Satori → SVG → resvg → PNG), adapters, export
- `frontend/` – Vite + React + Tailwind preview UI

## Dev

```sh
bun install
bun run dev:backend     # http://localhost:8787
bun run dev:frontend    # http://localhost:5173 (proxies /api to backend)
bun run render:fixture  # renders backend/fixtures/*.json to backend/out/
```
