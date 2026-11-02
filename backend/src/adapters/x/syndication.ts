import { ExtractError } from "../errors";

/**
 * X's public embed (syndication) endpoint, the same one embedded-tweet widgets use.
 * No account auth; only returns posts that can be publicly embedded.
 */
const BASE = "https://cdn.syndication.twimg.com/tweet-result";
const TIMEOUT_MS = 10_000;
const TTL_MS = 10 * 60_000;

export interface SynMedia {
  type: "photo" | "video" | "animated_gif";
  media_url_https: string;
  ext_alt_text?: string;
  original_info?: { width: number; height: number };
  video_info?: {
    duration_millis?: number;
    variants?: { bitrate?: number; content_type: string; url: string }[];
  };
}
export interface SynTweet {
  __typename: "Tweet" | "TweetTombstone" | string;
  id_str: string;
  text: string;
  created_at: string;
  display_text_range?: [number, number];
  entities?: {
    urls?: { url: string; expanded_url: string; display_url: string; indices: [number, number] }[];
    media?: { url: string; indices: [number, number] }[];
  };
  user: {
    name: string;
    screen_name: string;
    profile_image_url_https?: string;
    verified?: boolean;
    is_blue_verified?: boolean;
  };
  mediaDetails?: SynMedia[];
  photos?: unknown[];
  video?: { poster?: string };
  in_reply_to_status_id_str?: string;
  in_reply_to_screen_name?: string;
  parent?: SynTweet;
  quoted_tweet?: SynTweet;
  tombstone?: unknown;
}

const token = (id: string) => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
const cache = new Map<string, { at: number; data: SynTweet }>();

export async function fetchTweet(id: string): Promise<SynTweet> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const url = `${BASE}?id=${id}&lang=en&token=${token(id)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FerrixRenderer/0.1)", Accept: "application/json" },
    });
  } catch {
    throw new ExtractError("upstream_error", "Could not reach X");
  }
  if (res.status === 404) throw new ExtractError("not_found", "Post not found, deleted, or not public");
  if (res.status === 429) throw new ExtractError("rate_limited", "X is rate limiting requests, try again shortly");
  if (!res.ok) throw new ExtractError("upstream_error", `X responded ${res.status}`);

  const text = await res.text();
  if (!text.trim()) throw new ExtractError("not_found", "Post not found, deleted, or not public");
  let data: SynTweet;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ExtractError("upstream_error", "Unexpected response from X");
  }
  if (data.__typename === "TweetTombstone" || data.tombstone)
    throw new ExtractError("unavailable", "This post is unavailable (protected, age-restricted, or removed)");
  if (data.__typename !== "Tweet" || !data.user) throw new ExtractError("upstream_error", "Unexpected response from X");

  cache.set(id, { at: Date.now(), data });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return data;
}
