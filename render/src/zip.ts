import { zipSync } from "fflate";

export interface NamedFile {
  name: string;
  data: Uint8Array;
}

/** ZIP of already-compressed images plus a sources.json manifest crediting the original posts. */
export function zipImages(images: NamedFile[], sourceUrls: string[]): Uint8Array {
  const files: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const img of images) files[img.name] = [img.data, { level: 0 }];
  const manifest = JSON.stringify({ generator: "Ferrix", sources: sourceUrls }, null, 2);
  files["sources.json"] = [new TextEncoder().encode(manifest), { level: 0 }];
  return zipSync(files);
}
