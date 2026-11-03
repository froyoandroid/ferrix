import { z } from "zod";

export const LIMITS = {
  textChars: 25_000,
  mediaPerPost: 4,
  postsPerThread: 50,
} as const;

export const Platform = z.enum(["x", "threads", "facebook"]);
export type Platform = z.infer<typeof Platform>;

export const MediaItem = z.object({
  type: z.enum(["image", "video", "gif"]),
  url: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  altText: z.string().max(2_000).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /** Crop focus for cover-fitted tiles, 0 (left/top) to 1 (right/bottom). Default centre. */
  focusX: z.number().min(0).max(1).optional(),
  focusY: z.number().min(0).max(1).optional(),
  /** Left out of the rendered image (user choice in the editor). */
  hidden: z.boolean().optional(),
});
export type MediaItem = z.infer<typeof MediaItem>;

const PostBase = z.object({
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
  /** Engagement counts as shown on the platform; any may be missing (X embed API only gives likes + replies). */
  metrics: z
    .object({
      replies: z.number().int().nonnegative().optional(),
      reposts: z.number().int().nonnegative().optional(),
      likes: z.number().int().nonnegative().optional(),
      bookmarks: z.number().int().nonnegative().optional(),
      views: z.number().int().nonnegative().optional(),
      shares: z.number().int().nonnegative().optional(),
    })
    .optional(),
  timestamp: z.string().datetime({ offset: true }).optional(),
});

/** A post embedded inside another (X quote post). One level deep only. */
export const QuotedPost = PostBase;
export type QuotedPost = z.infer<typeof QuotedPost>;

export const NormalizedPost = PostBase.extend({
  quote: QuotedPost.optional(),
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
  theme: z.enum(["light", "dark", "ferrix"]).default("light"),
  attribution: AttributionPreset.default("original"),
  scale: z.number().min(1).max(3).default(2),
  width: z.number().int().min(320).max(1200).default(600),
  timeZone: TimeZone.default("UTC"),
  /** Max height (CSS px, before scale) of one combined-thread image before it is split. */
  maxHeight: z.number().int().min(800).max(8000).default(3200),
  /** Engagement row (replies, reposts, likes, bookmarks, views) under the post. */
  showMetrics: z.boolean().default(false),
  /** Post date/time (shown with the Original preset). */
  showDate: z.boolean().default(true),
  /** Platform mark in the header: current X logo, the classic Twitter bird, or none. */
  logo: z.enum(["x", "twitter", "none"]).default("x"),
  /** Replace the middle of every @username with ****. */
  maskUsername: z.boolean().default(false),
  /** Media frame: "auto" keeps a single image's own ratio (clamped); otherwise every layout uses this ratio. */
  mediaAspect: z.enum(["auto", "16:9", "3:2", "1:1", "4:5"]).default("auto"),
  /** Alt text: hidden, an ALT badge on the tile (like X), or written under the media. */
  altText: z.enum(["off", "badge", "caption"]).default("badge"),
});
export type RenderOptions = z.infer<typeof RenderOptions>;

export const RenderRequest = z.object({
  post: NormalizedPost,
  options: RenderOptions.default({}),
  /** Optional corner label such as "3/10" (used for previewing one card of a thread). */
  badge: z.string().max(12).optional(),
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
