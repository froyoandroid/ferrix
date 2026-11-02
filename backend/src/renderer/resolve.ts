import type { MediaItem, NormalizedPost } from "@ferrix/shared";
import { loadImage, type LoadedImage } from "./images";

export interface ResolvedMedia extends MediaItem {
  img: LoadedImage | null;
}
export interface ResolvedPost extends NormalizedPost {
  avatar: LoadedImage | null;
  resolvedMedia: ResolvedMedia[];
}

/** Fetch avatar and media (video → thumbnail) up front; failures become null placeholders. */
export async function resolvePost(post: NormalizedPost, withAvatar: boolean): Promise<ResolvedPost> {
  const [avatar, imgs] = await Promise.all([
    withAvatar ? loadImage(post.author.avatarUrl) : Promise.resolve(null),
    Promise.all(post.content.media.map((m) => loadImage(m.type === "video" ? m.thumbnailUrl : (m.url ?? m.thumbnailUrl)))),
  ]);
  return {
    ...post,
    avatar,
    resolvedMedia: post.content.media.map((m, i) => ({ ...m, img: imgs[i] })),
  };
}
