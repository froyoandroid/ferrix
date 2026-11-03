import { Resvg } from "@resvg/resvg-js";
import type { NormalizedPost, RenderOptions } from "@ferrix/shared";
import { createRenderer, type ThreadOpts } from "@ferrix/render";
import { loadFallbackFonts, loadFonts } from "./fonts";
import { emojiDataUri } from "./emoji";
import { loadImage } from "./images";

export interface RenderedImage {
  name: string;
  png: Uint8Array;
}

/** Server-side renderer: same layout engine as the browser, rasterized with resvg. */
export const renderer = createRenderer({ fonts: loadFonts, fallbackFonts: loadFallbackFonts, loadImage, emoji: emojiDataUri });

const toPng = (svg: string, scale: number) => new Resvg(svg, { fitTo: { mode: "zoom", value: scale } }).render().asPng();

export async function renderSvg(post: NormalizedPost, options: RenderOptions, badge?: string) {
  return (await renderer.card(post, options, badge)).svg;
}

export async function renderPng(post: NormalizedPost, options: RenderOptions, badge?: string) {
  return toPng(await renderSvg(post, options, badge), options.scale);
}

export async function renderThread(posts: NormalizedPost[], opts: ThreadOpts): Promise<RenderedImage[]> {
  return (await renderer.thread(posts, opts)).map((img) => ({ name: img.name, png: toPng(img.svg, opts.options.scale) }));
}

export async function previewThread(posts: NormalizedPost[], opts: Omit<ThreadOpts, "mode">) {
  return (await renderer.thread(posts, { ...opts, mode: "combined" })).map((img) => img.svg);
}

export const resolveFor = (post: NormalizedPost, options: RenderOptions) => renderer.resolve(post, options);
