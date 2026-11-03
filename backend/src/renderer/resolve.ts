import type { MediaItem, NormalizedPost, QuotedPost } from "@ferrix/shared";
import { loadImage, type LoadedImage } from "./images";

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

/** Fetch avatar and media (video → thumbnail) up front; failures become null placeholders. */
async function resolveBase<T extends QuotedPost>(post: T, withAvatar: boolean) {
  const [avatar, imgs] = await Promise.all([
    withAvatar ? loadImage(post.author.avatarUrl) : Promise.resolve(null),
    Promise.all(post.content.media.map((m) => loadImage(m.type === "image" ? (m.url ?? m.thumbnailUrl) : m.thumbnailUrl))),
  ]);
  return { ...post, avatar, resolvedMedia: post.content.media.map((m, i) => ({ ...m, img: imgs[i] })) };
}

export async function resolvePost(post: NormalizedPost, withAvatar: boolean): Promise<ResolvedPost> {
  const { quote, ...rest } = post;
  const [main, resolvedQuote] = await Promise.all([
    resolveBase(rest, withAvatar),
    quote ? resolveBase(quote, withAvatar) : Promise.resolve(undefined),
  ]);
  return { ...main, resolvedQuote };
}
