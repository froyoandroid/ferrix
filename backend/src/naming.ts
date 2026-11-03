import type { NormalizedPost } from "@ferrix/shared";

const clean = (s: string | undefined) => (s ?? "").replace(/[^A-Za-z0-9_-]+/g, "").slice(0, 40);

/** Identifying file stem: ferrix_x_<username>_<postId>, falling back gracefully when fields are missing. */
export function fileBase(post: Pick<NormalizedPost, "platform" | "postId" | "author" | "sourceUrl">, masked = false): string {
  // A masked render must not leak the handle through its filename.
  const user = masked ? "hidden" : clean(post.author.username) || clean(post.author.name) || "post";
  const id = clean(post.postId) || clean(post.sourceUrl.split("/").pop());
  return ["ferrix", post.platform, user, id].filter(Boolean).join("_");
}
