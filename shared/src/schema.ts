import { z } from "zod";

export const Platform = z.enum(["x", "threads", "facebook"]);
export type Platform = z.infer<typeof Platform>;

export const MediaItem = z.object({
  type: z.enum(["image", "video"]),
  url: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  altText: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type MediaItem = z.infer<typeof MediaItem>;

export const NormalizedPost = z.object({
  platform: Platform,
  sourceUrl: z.string().url(),
  postId: z.string().optional(),
  author: z.object({
    name: z.string().optional(),
    username: z.string().optional(),
    avatarUrl: z.string().url().optional(),
    // Only true when confirmed by source data; never inferred.
    verified: z.boolean().optional(),
  }),
  content: z.object({
    text: z.string(),
    media: z.array(MediaItem).default([]),
  }),
  timestamp: z.string().datetime({ offset: true }).optional(),
  thread: z
    .object({
      parentId: z.string().optional(),
      position: z.number().int().positive().optional(),
      total: z.number().int().positive().optional(),
    })
    .optional(),
});
export type NormalizedPost = z.infer<typeof NormalizedPost>;

export const AttributionPreset = z.enum(["original", "minimal", "clean"]);
export type AttributionPreset = z.infer<typeof AttributionPreset>;

export const RenderOptions = z.object({
  theme: z.enum(["light", "dark"]).default("light"),
  attribution: AttributionPreset.default("original"),
  scale: z.number().min(1).max(3).default(2),
  width: z.number().int().min(320).max(1200).default(600),
});
export type RenderOptions = z.infer<typeof RenderOptions>;

export const RenderRequest = z.object({
  post: NormalizedPost,
  options: RenderOptions.default({}),
});
export type RenderRequest = z.infer<typeof RenderRequest>;
