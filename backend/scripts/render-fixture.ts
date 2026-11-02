import { readdir, mkdir } from "node:fs/promises";
import { RenderRequest, ThreadRenderRequest } from "@ferrix/shared";
import { renderPng, renderThread } from "../src/renderer";

const dir = new URL("../fixtures/", import.meta.url);
const out = new URL("../out/", import.meta.url);
await mkdir(out, { recursive: true });
const only = process.argv[2];

for (const name of (await readdir(dir)).filter((f) => f.endsWith(".json") && (!only || f.includes(only)))) {
  const raw = await Bun.file(new URL(name, dir)).json();
  const base = name.replace(/\.json$/, "");
  for (const theme of ["light", "dark"] as const) {
    if ("posts" in raw) {
      const req = ThreadRenderRequest.parse(raw);
      for (const mode of ["combined", "individual"] as const) {
        const imgs = await renderThread(req.posts, { ...req, mode, options: { ...req.options, theme } });
        for (const img of imgs) {
          const file = new URL(`${base}.${theme}.${mode}.${img.name}`, out);
          await Bun.write(file, img.png);
          console.log("wrote", file.pathname);
        }
      }
    } else {
      const req = RenderRequest.parse(raw);
      const file = new URL(`${base}.${theme}.png`, out);
      await Bun.write(file, await renderPng(req.post, { ...req.options, theme }));
      console.log("wrote", file.pathname);
    }
  }
}
