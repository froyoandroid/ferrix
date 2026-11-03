import satori, { type Font } from "satori";
import type { NormalizedPost, RenderOptions, ThreadMode } from "@ferrix/shared";
import { themes } from "./themes";
import { resolvePost, type ImageLoader, type ResolvedPost } from "./resolve";
import { XCard } from "./templates/x";
import { XThreadFrame, XThreadItem } from "./templates/x-thread";
import { ThreadsCard } from "./templates/threads";
import { fileBase } from "./naming";
import { SUBSET_FAMILIES, scriptFonts, subsetText } from "./scripts";

/**
 * Everything platform-specific the renderer needs. The server supplies disk fonts and a direct safe
 * fetcher; the browser supplies fonts from static assets and images through /api/img.
 */
export interface RenderEnv {
  fonts: () => Promise<Font[]>;
  loadImage: ImageLoader;
  emoji: (segment: string) => Promise<string | null>;
  /** Full-coverage fonts (sub/superscripts, arrows, Greek, Cyrillic), loaded only when a glyph is missing. */
  fallbackFonts?: () => Promise<Font[]>;
  /** A subset of one script font (CJK, Thai, Indic, Arabic, ...) holding just `text`, or null. */
  scriptFont?: (family: string, weight: number, text: string) => Promise<ArrayBuffer | null>;
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
  if (post.platform !== "x" && post.platform !== "threads") throw new Error(`Platform "${post.platform}" is not supported yet`);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Layout engine: post data -> SVG (text as paths, images inlined). Rasterizing is the caller's job. */
/** The thread's opening post (earliest), so file names do not change when cards are reordered. */
export function threadRoot(posts: NormalizedPost[]): NormalizedPost {
  return posts.reduce((a, b) => (b.timestamp && a.timestamp && b.timestamp < a.timestamp ? b : a), posts[0]);
}

export function createRenderer(env: RenderEnv) {
  async function toSvg(el: JSX.Element, width: number): Promise<string> {
    try {
      return await layout(el, width, true);
    } catch (err) {
      // A script font the layout engine cannot parse must not fail the render: draw without it.
      if (!/lookupType|substFormat|not yet supported|Unsupported OpenType/i.test(String((err as Error)?.message))) throw err;
      return layout(el, width, false);
    }
  }

  async function layout(el: JSX.Element, width: number, withScripts: boolean) {
    return satori(el, {
      width,
      fonts: await env.fonts(),
      loadAdditionalAsset: async (code, segment) => {
        if (code === "emoji") return (await env.emoji(segment)) ?? segment;
        const text = subsetText(segment);
        const loaded: Font[] = [];
        if (withScripts && env.scriptFont && text) {
          // Subsets of at most 200 characters keep request URLs short; each gets its own name.
          const chars = [...text];
          const chunks = Array.from({ length: Math.ceil(chars.length / 200) }, (_, i) => chars.slice(i * 200, i * 200 + 200).join(""));
          const jobs = scriptFonts(code, segment).flatMap(({ family, weights }) =>
            weights.flatMap((weight) =>
              (SUBSET_FAMILIES.has(family) ? chunks : [""]).map(async (chunk) => {
                const data = await env.scriptFont!(family, weight, chunk).catch(() => null);
                if (data) loaded.push({ name: chunk ? `${family} ${chunk.slice(0, 6)}` : family, data, weight: weight as Font["weight"], style: "normal" });
              }),
            ),
          );
          await Promise.all(jobs);
        }
        const fallback = env.fallbackFonts ? await env.fallbackFonts().catch(() => []) : [];
        return [...loaded, ...fallback];
      },
    });
  }

  function resolve(post: NormalizedPost, options: RenderOptions): Promise<ResolvedPost> {
    assertSupported(post);
    return resolvePost(post, options.attribution === "original", env.loadImage);
  }

  async function card(post: NormalizedPost, options: RenderOptions, badge?: string): Promise<SvgImage> {
    const resolved = await resolve(post, options);
    const Card = post.platform === "threads" ? ThreadsCard : XCard;
    const svg = await toSvg(<Card post={resolved} options={options} theme={themes[options.theme]} badge={badge} />, options.width);
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
      const full = options.postsPerImage > 0 && cur.length >= options.postsPerImage;
      if (cur.length && (full || h + ih > options.maxHeight)) {
        segments.push(cur);
        cur = [];
        h = 16;
      }
      cur.push(i);
      h += ih;
    });
    if (cur.length) segments.push(cur);

    const last = resolved.length - 1;
    const base = `${fileBase(threadRoot(posts), options.maskUsername)}_thread`;
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
