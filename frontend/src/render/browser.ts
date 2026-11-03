import { createRenderer, fileBase, svgSize, zipImages, type LoadedImage, threadRoot } from "@ferrix/render";
import type { Font } from "satori";
import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff?url";
import inter700 from "@fontsource/inter/files/inter-latin-700-normal.woff?url";
import interFull400 from "@ferrix/render/fonts/inter-full-400.ttf?url";
import interFull700 from "@ferrix/render/fonts/inter-full-700.ttf?url";

/**
 * Browser renderer: the same layout engine the server uses, running locally. The server is only
 * asked for things the browser cannot do itself: extracting the post (once) and fetching remote
 * images through the safe proxy (/api/img). Rasterizing to PNG/WebP happens on a canvas.
 */

let fonts: Promise<Font[]> | null = null;
function loadFonts() {
  fonts ??= Promise.all([inter400, inter700].map((u) => fetch(u).then((r) => r.arrayBuffer()))).then(([regular, bold]) => [
    { name: "Inter", data: regular, weight: 400, style: "normal" },
    { name: "Inter", data: bold, weight: 700, style: "normal" },
  ]);
  return fonts;
}

let fallback: Promise<Font[]> | null = null;
/** Full Inter, fetched only when a post has glyphs outside the latin subset. */
function loadFallbackFonts() {
  fallback ??= Promise.all([interFull400, interFull700].map((u) => fetch(u).then((r) => r.arrayBuffer()))).then(([regular, bold]) => [
    { name: "Inter Full", data: regular, weight: 400, style: "normal" },
    { name: "Inter Full", data: bold, weight: 700, style: "normal" },
  ]);
  fallback.catch(() => (fallback = null));
  return fallback;
}

const blobToDataUri = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

function dataUrlBlob(url: string): Blob {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.*)$/.exec(url);
  if (!m) throw new Error("unsupported data URL");
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

const images = new Map<string, Promise<LoadedImage | null>>();
function loadImage(url: string | undefined): Promise<LoadedImage | null> {
  if (!url) return Promise.resolve(null);
  let p = images.get(url);
  if (!p) {
    p = (async () => {
      const blob = url.startsWith("data:image/")
        ? dataUrlBlob(url) // decoded locally: the CSP keeps fetch() to our own origin
        : await fetch(`/api/img?u=${encodeURIComponent(url)}`).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))));
      const bmp = await createImageBitmap(blob);
      const out = { src: url.startsWith("data:") ? url : await blobToDataUri(blob), width: bmp.width, height: bmp.height };
      bmp.close();
      return out;
    })().catch(() => null);
    images.set(url, p);
    if (images.size > 300) images.delete(images.keys().next().value!);
  }
  return p;
}

const emojis = new Map<string, Promise<string | null>>();
function emoji(seg: string) {
  let p = emojis.get(seg);
  if (!p) {
    p = fetch(`/api/emoji?s=${encodeURIComponent(seg)}`).then((r) => (r.ok ? r.text() : null)).catch(() => null);
    emojis.set(seg, p);
  }
  return p;
}

export const renderer = createRenderer({ fonts: loadFonts, fallbackFonts: loadFallbackFonts, loadImage, emoji });
export { fileBase, svgSize, threadRoot, zipImages };

// Canvas limits differ per browser; stay well inside Safari's (16384px side, ~16.7M px area on iOS).
const MAX_SIDE = 16384;
const MAX_AREA = 16_777_216;

export function canRasterize(svg: string, scale: number) {
  const { w, h } = svgSize(svg);
  return w * scale <= MAX_SIDE && h * scale <= MAX_SIDE && w * h * scale * scale <= MAX_AREA;
}

export type ImageFormat = "png" | "webp";

export async function rasterize(svg: string, scale: number, format: ImageFormat): Promise<Uint8Array> {
  const { w, h } = svgSize(svg);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, `image/${format}`, format === "webp" ? 0.92 : undefined));
    if (!blob || blob.type !== `image/${format}`) throw new Error(`This browser cannot encode ${format.toUpperCase()}`);
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
