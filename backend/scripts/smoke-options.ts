// Live: render one X post with arbitrary RenderOptions as JSON. e.g.
// bun scripts/smoke-options.ts <url> '{"showMetrics":true,"logo":"twitter","maskUsername":true}' out-name
import { mkdir, writeFile } from "node:fs/promises";
import { RenderOptions } from "@ferrix/shared";
import { extract } from "../src/adapters";
import { renderPng } from "../src/renderer";

const [url, json = "{}", name = "options"] = process.argv.slice(2);
if (!url) throw new Error("usage: bun scripts/smoke-options.ts <url> [optionsJson] [name]");
const [post] = await extract(url, { thread: false });
const png = await renderPng(post, RenderOptions.parse({ timeZone: "Asia/Jakarta", ...JSON.parse(json) }));
await mkdir("out", { recursive: true });
await writeFile(`out/${name}.png`, png);
console.log(`out/${name}.png`, post.metrics);
