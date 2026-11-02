// Usage: bun scripts/smoke-extract.ts <post-url> [--thread]
// Extracts a live post and renders it to out/smoke-<id>.{light,dark}.png
import { mkdir } from "node:fs/promises";
import { RenderOptions } from "@ferrix/shared";
import { extract } from "../src/adapters";
import { renderPng, renderThread } from "../src/renderer";

const url = process.argv[2];
if (!url) throw new Error("Usage: bun scripts/smoke-extract.ts <post-url> [--thread]");
const thread = process.argv.includes("--thread");
const posts = await extract(url, { thread });
console.log(JSON.stringify(posts, null, 2));

const out = new URL("../out/", import.meta.url);
await mkdir(out, { recursive: true });
for (const theme of ["light", "dark"] as const) {
  const options = RenderOptions.parse({ theme, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  const id = posts.at(-1)!.postId;
  if (posts.length === 1) {
    await Bun.write(new URL(`smoke-${id}.${theme}.png`, out), await renderPng(posts[0], options));
  } else {
    for (const img of await renderThread(posts, { mode: "combined", numbering: true, options }))
      await Bun.write(new URL(`smoke-${id}.${theme}.${img.name}`, out), img.png);
  }
}
console.log("rendered to", out.pathname);
