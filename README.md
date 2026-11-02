# Ferrix

> The message outlives the messenger.

Turns public social posts (X, Threads; Facebook later) into standalone images you can download and post fresh.

## Layout

- `shared/` – Zod schemas and types (normalized post model, render options)
- `backend/` – Bun + Hono API; renderer (Satori → SVG → resvg → PNG), adapters, export
- `frontend/` – Vite + React + Tailwind preview UI

## API

- `POST /api/render` – `{ post, options }` → PNG
- `POST /api/render/thread` – `{ posts, mode: "combined" | "individual", numbering, select?, options }` → PNG, or ZIP (with `sources.json`) when there are several images

Remote images (avatars, media) are fetched only over https from hosts in `FERRIX_IMAGE_HOSTS` (default `pbs.twimg.com,abs.twimg.com`), with no redirects, an 8 MB cap, and a magic-byte check.

## Dev

```sh
bun install
bun run dev:backend     # http://localhost:8787
bun run dev:frontend    # http://localhost:5173 (proxies /api to backend)
bun run render:fixture  # renders backend/fixtures/*.json to backend/out/
```
