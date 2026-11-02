import { z } from "zod";

export const LIMITS = {
  textChars: 25_000,
  mediaPerPost: 4,
  postsPerThread: 50,
} as const;

export const Platform = z.enum(["x", "threads", "facebook"]);
export type Platform = z.infer<typeof Platform>;

export const MediaItem = z.object({
  type: z.enum(["image", "video"]),
  url: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  altText: z.string().max(2_000).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type MediaItem = z.infer<typeof MediaItem>;

export const NormalizedPost = z.object({
  platform: Platform,
  sourceUrl: z.string().url(),
  postId: z.string().max(64).optional(),
  author: z.object({
    name: z.string().max(100).optional(),
    username: z.string().max(100).optional(),
    avatarUrl: z.string().url().optional(),
    // Only true when confirmed by source data; never inferred.
    verified: z.boolean().optional(),
  }),
  content: z.object({
    text: z.string().max(LIMITS.textChars),
    media: z.array(MediaItem).max(LIMITS.mediaPerPost).default([]),
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

const TimeZone = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid IANA time zone" },
);

export const RenderOptions = z.object({
  theme: z.enum(["light", "dark"]).default("light"),
  attribution: AttributionPreset.default("original"),
  scale: z.number().min(1).max(3).default(2),
  width: z.number().int().min(320).max(1200).default(600),
  timeZone: TimeZone.default("UTC"),
  /** Max height (CSS px, before scale) of one combined-thread image before it is split. */
  maxHeight: z.number().int().min(800).max(8000).default(3200),
});
export type RenderOptions = z.infer<typeof RenderOptions>;

export const RenderRequest = z.object({
  post: NormalizedPost,
  options: RenderOptions.default({}),
});
export type RenderRequest = z.infer<typeof RenderRequest>;

export const ThreadMode = z.enum(["individual", "combined"]);
export type ThreadMode = z.infer<typeof ThreadMode>;

export const ThreadRenderRequest = z.object({
  posts: z.array(NormalizedPost).min(1).max(LIMITS.postsPerThread),
  mode: ThreadMode.default("combined"),
  numbering: z.boolean().default(true),
  /** 1-based positions to export; all when omitted. */
  select: z.array(z.number().int().positive()).optional(),
  options: RenderOptions.default({}),
});
export type ThreadRenderRequest = z.infer<typeof ThreadRenderRequest>;
