import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { NormalizedPost, RenderOptions, ThreadMode } from "@ferrix/shared";
import { loadFonts } from "./fonts";
import { emojiDataUri } from "./emoji";
import { themes } from "./themes";
import { resolvePost, type ResolvedPost } from "./resolve";
import { XCard } from "./templates/x";
import { XThreadFrame, XThreadItem } from "./templates/x-thread";
import { fileBase } from "../naming";

export interface RenderedImage {
  name: string;
  png: Uint8Array;
}

function assertSupported(post: NormalizedPost) {
  if (post.platform !== "x") throw new Error(`Platform "${post.platform}" is not supported yet`);
}

async function toSvg(el: JSX.Element, width: number) {
  return satori(el, {
    width,
    fonts: await loadFonts(),
    loadAdditionalAsset: async (code, segment) => (code === "emoji" ? ((await emojiDataUri(segment)) ?? segment) : []),
  });
}

function rasterize(svg: string, scale: number) {
  return new Resvg(svg, { fitTo: { mode: "zoom", value: scale } }).render();
}

function toPng(svg: string, scale: number): Uint8Array {
  return rasterize(svg, scale).asPng();
}

function svgHeight(svg: string) {
  return Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 0);
}

export async function resolveFor(post: NormalizedPost, options: RenderOptions): Promise<ResolvedPost> {
  assertSupported(post);
  return resolvePost(post, options.attribution === "original");
}

async function cardSvg(resolved: ResolvedPost, options: RenderOptions, badge?: string) {
  return toSvg(<XCard post={resolved} options={options} theme={themes[options.theme]} badge={badge} />, options.width);
}

export async function renderPng(post: NormalizedPost, options: RenderOptions, badge?: string): Promise<Uint8Array> {
  return toPng(await cardSvg(await resolveFor(post, options), options, badge), options.scale);
}

export async function renderThread(
  posts: NormalizedPost[],
  opts: { mode: ThreadMode; numbering: boolean; select?: number[]; options: RenderOptions },
): Promise<RenderedImage[]> {
  posts.forEach(assertSupported);
  const { options } = opts;
  const total = posts.length;
  const picked = posts
    .map((post, i) => ({ post, pos: i + 1 }))
    .filter(({ pos }) => !opts.select || opts.select.includes(pos));
  if (!picked.length) throw new Error("Selection matched no posts");
  const num = (pos: number) => (opts.numbering ? `${pos}/${total}` : undefined);
  const pad = (n: number) => String(n).padStart(2, "0");

  if (opts.mode === "individual") {
    return Promise.all(
      picked.map(async ({ post, pos }) => ({
        name: `${fileBase(post, options.maskUsername)}_${pad(pos)}of${pad(total)}.png`,
        png: await renderPng(post, options, num(pos)),
      })),
    );
  }

  // Combined: render each item alone to measure, then pack into segments under maxHeight.
  const theme = themes[options.theme];
  const resolved: ResolvedPost[] = await Promise.all(
    picked.map(({ post }) => resolvePost(post, options.attribution === "original")),
  );
  const item = (i: number, above: boolean, below: boolean) => (
    <XThreadItem key={i} post={resolved[i]} options={options} theme={theme} number={num(picked[i].pos)} connectAbove={above} connectBelow={below} />
  );
  const heights = await Promise.all(resolved.map(async (_, i) => svgHeight(await toSvg(item(i, true, true), options.width))));

  const segments: number[][] = [];
  let cur: number[] = [];
  let h = 16; // frame padding
  heights.forEach((ih, i) => {
    if (cur.length && h + ih > options.maxHeight) {
      segments.push(cur);
      cur = [];
      h = 16;
    }
    cur.push(i);
    h += ih;
  });
  if (cur.length) segments.push(cur);

  const last = resolved.length - 1;
  return Promise.all(
    segments.map(async (seg, s) => {
      const svg = await toSvg(
        <XThreadFrame theme={theme} width={options.width}>
          {seg.map((i) => item(i, i > 0, i < last))}
        </XThreadFrame>,
        options.width,
      );
      const base = `${fileBase(posts[0], options.maskUsername)}_thread`;
      return { name: segments.length > 1 ? `${base}_${pad(s + 1)}.png` : `${base}.png`, png: toPng(svg, options.scale) };
    }),
  );
}
