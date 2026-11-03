import { LIMITS } from "@ferrix/shared";
import type { MediaItem, NormalizedPost, QuotedPost } from "@ferrix/shared";

export interface LoadedImage {
  src: string; // data URI
  width: number;
  height: number;
}
export type ImageLoader = (url: string | undefined) => Promise<LoadedImage | null>;

export interface ResolvedMedia extends MediaItem {
  img: LoadedImage | null;
}
export interface ResolvedQuote extends QuotedPost {
  avatar: LoadedImage | null;
  resolvedMedia: ResolvedMedia[];
}
export interface ResolvedPost extends Omit<NormalizedPost, "quote"> {
  avatar: LoadedImage | null;
  resolvedMedia: ResolvedMedia[];
  resolvedQuote?: ResolvedQuote;
}

/** Fetch avatar and media (video -> thumbnail) up front; failures become null placeholders. */
async function resolveBase<T extends QuotedPost>(post: T, withAvatar: boolean, load: ImageLoader) {
  const media = post.content.media.filter((m) => !m.hidden).slice(0, LIMITS.mediaShown);
  const [avatar, imgs] = await Promise.all([
    withAvatar ? load(post.author.avatarUrl) : Promise.resolve(null),
    Promise.all(media.map((m) => load(m.type === "image" ? (m.url ?? m.thumbnailUrl) : m.thumbnailUrl))),
  ]);
  return { ...post, avatar, resolvedMedia: media.map((m, i) => ({ ...m, img: imgs[i] })) };
}

export async function resolvePost(post: NormalizedPost, withAvatar: boolean, load: ImageLoader): Promise<ResolvedPost> {
  const { quote, ...rest } = post;
  const [main, resolvedQuote] = await Promise.all([
    resolveBase(rest, withAvatar, load),
    quote ? resolveBase(quote, withAvatar, load) : Promise.resolve(undefined),
  ]);
  return { ...main, resolvedQuote };
}
