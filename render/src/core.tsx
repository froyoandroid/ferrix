import satori, { type Font } from "satori";
import type { NormalizedPost, RenderOptions, ThreadMode } from "@ferrix/shared";
import { themes } from "./themes";
import { resolvePost, type ImageLoader, type ResolvedPost } from "./resolve";
import { XCard } from "./templates/x";
import { XThreadFrame, XThreadItem } from "./templates/x-thread";
import { fileBase } from "./naming";

/**
 * Everything platform-specific the renderer needs. The server supplies disk fonts and a direct safe
 * fetcher; the browser supplies fonts from static assets and images through /api/img.
 */
export interface RenderEnv {
  fonts: () => Promise<Font[]>;
  loadImage: ImageLoader;
  emoji: (segment: string) => Promise<string | null>;
}

export interface SvgImage {
  name: string;
  svg: string;
}

export interface ThreadOpts {
  mode: ThreadMode;
  numbering: boolean;
  select?: number[];
  options: RenderOptions;
}

export function svgSize(svg: string) {
  return {
    w: Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 0),
    h: Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 0),
  };
}

function assertSupported(post: NormalizedPost) {
  if (post.platform !== "x") throw new Error(`Platform "${post.platform}" is not supported yet`);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Layout engine: post data -> SVG (text as paths, images inlined). Rasterizing is the caller's job. */
export function createRenderer(env: RenderEnv) {
  async function toSvg(el: JSX.Element, width: number) {
    return satori(el, {
      width,
      fonts: await env.fonts(),
      loadAdditionalAsset: async (code, segment) => (code === "emoji" ? ((await env.emoji(segment)) ?? segment) : []),
    });
  }

  function resolve(post: NormalizedPost, options: RenderOptions): Promise<ResolvedPost> {
    assertSupported(post);
    return resolvePost(post, options.attribution === "original", env.loadImage);
  }

  async function card(post: NormalizedPost, options: RenderOptions, badge?: string): Promise<SvgImage> {
    const resolved = await resolve(post, options);
    const svg = await toSvg(<XCard post={resolved} options={options} theme={themes[options.theme]} badge={badge} />, options.width);
    return { name: `${fileBase(post, options.maskUsername)}_${options.theme}.png`, svg };
  }

  function pick(posts: NormalizedPost[], select?: number[]) {
    posts.forEach(assertSupported);
    const picked = posts.map((post, i) => ({ post, pos: i + 1 })).filter(({ pos }) => !select || select.includes(pos));
    if (!picked.length) throw new Error("Selection matched no posts");
    return picked;
  }

  /** A thread as the images it exports: one per card (individual) or split segments (combined). */
  async function thread(posts: NormalizedPost[], opts: ThreadOpts): Promise<SvgImage[]> {
    const { options } = opts;
    const total = posts.length;
    const picked = pick(posts, opts.select);
    const num = (pos: number) => (opts.numbering ? `${pos}/${total}` : undefined);

    if (opts.mode === "individual") {
      return Promise.all(
        picked.map(async ({ post, pos }) => ({
          name: `${fileBase(post, options.maskUsername)}_${pad(pos)}of${pad(total)}.png`,
          svg: (await card(post, options, num(pos))).svg,
        })),
      );
    }

    // Combined: render each item alone to measure, then pack into segments under maxHeight.
    const theme = themes[options.theme];
    const resolved = await Promise.all(picked.map(({ post }) => resolve(post, options)));
    const item = (i: number, above: boolean, below: boolean) => (
      <XThreadItem key={i} post={resolved[i]} options={options} theme={theme} number={num(picked[i].pos)} connectAbove={above} connectBelow={below} />
    );
    const heights = await Promise.all(resolved.map(async (_, i) => svgSize(await toSvg(item(i, true, true), options.width)).h));

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
    const base = `${fileBase(posts[0], options.maskUsername)}_thread`;
    return Promise.all(
      segments.map(async (seg, s) => ({
        name: segments.length > 1 ? `${base}_${pad(s + 1)}.png` : `${base}.png`,
        svg: await toSvg(
          <XThreadFrame theme={theme} width={options.width}>
            {seg.map((i) => item(i, i > 0, i < last))}
          </XThreadFrame>,
          options.width,
        ),
      })),
    );
  }

  return { card, thread, resolve };
}

export type Renderer = ReturnType<typeof createRenderer>;
