import { zipSync } from "fflate";
import type { RenderedImage } from "../renderer";

export function zipImages(images: RenderedImage[], sourceUrls: string[]): Uint8Array {
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const img of images) files[img.name] = [img.png, { level: 0 }]; // PNG is already compressed
  const manifest = JSON.stringify({ generator: "Ferrix", sources: sourceUrls }, null, 2);
  files["sources.json"] = [new TextEncoder().encode(manifest), { level: 0 }];
  return zipSync(files);
}
