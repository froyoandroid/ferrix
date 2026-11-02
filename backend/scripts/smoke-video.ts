// Live: extract an X post with video/GIF and write an animated MP4 to backend/out/.
import { mkdir, writeFile } from "node:fs/promises";
import { extract } from "../src/adapters";
import { renderMp4 } from "../src/video/animate";
import { fileBase } from "../src/naming";

const url = process.argv[2];
if (!url) throw new Error("usage: bun scripts/smoke-video.ts <url> [dark]");
const theme = process.argv[3] === "dark" ? "dark" : "light";
const [post] = await extract(url, { thread: false });
const t0 = performance.now();
const mp4 = await renderMp4(post, { theme, attribution: "original", scale: 2, width: 600, timeZone: "Asia/Jakarta", maxHeight: 3200 });
await mkdir("out", { recursive: true });
const name = `out/${fileBase(post)}_${theme}.mp4`;
await writeFile(name, mp4);
console.log(name, `${(mp4.length / 1e6).toFixed(1)} MB`, `${((performance.now() - t0) / 1000).toFixed(1)}s`);
