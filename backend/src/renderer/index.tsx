import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { NormalizedPost, RenderOptions } from "@ferrix/shared";
import { loadFonts } from "./fonts";
import { themes } from "./themes";
import { XCard } from "./templates/x";

const templates = { x: XCard } as const;

export async function renderSvg(post: NormalizedPost, options: RenderOptions): Promise<string> {
  const Template = templates[post.platform as keyof typeof templates];
  if (!Template) throw new Error(`No template for platform "${post.platform}" yet`);
  return satori(<Template post={post} options={options} theme={themes[options.theme]} />, {
    width: options.width,
    fonts: await loadFonts(),
  });
}

export async function renderPng(post: NormalizedPost, options: RenderOptions): Promise<Uint8Array> {
  const svg = await renderSvg(post, options);
  const resvg = new Resvg(svg, { fitTo: { mode: "zoom", value: options.scale } });
  return resvg.render().asPng();
}
