import { readdir, mkdir } from "node:fs/promises";
import { RenderRequest } from "@ferrix/shared";
import { renderPng } from "../src/renderer";

const dir = new URL("../fixtures/", import.meta.url);
const out = new URL("../out/", import.meta.url);
await mkdir(out, { recursive: true });

for (const name of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
  const req = RenderRequest.parse(await Bun.file(new URL(name, dir)).json());
  for (const theme of ["light", "dark"] as const) {
    const png = await renderPng(req.post, { ...req.options, theme });
    const file = new URL(name.replace(/\.json$/, `.${theme}.png`), out);
    await Bun.write(file, png);
    console.log("wrote", file.pathname);
  }
}
