import type { NormalizedPost } from "@ferrix/shared";
import { ExtractError } from "../errors";
import { parseXUrl } from "./url";
import { fetchTweet, type SynTweet } from "./syndication";
import { normalizeTweet } from "./normalize";

export { parseXUrl };
const MAX_THREAD = 25;

/**
 * Extract a post. With `thread`, walks up the reply chain while the parent is by the
 * same author, so pasting the last post of a self-thread returns the thread in order.
 */
export async function extractX(url: string, opts: { thread?: boolean } = {}): Promise<NormalizedPost[]> {
  const id = parseXUrl(url);
  if (!id) throw new ExtractError("unsupported_url", "Not an X post URL");
  const leaf = await fetchTweet(id);
  if (!opts.thread) return [normalizeTweet(leaf)];

  const author = leaf.user.screen_name.toLowerCase();
  const chain: SynTweet[] = [leaf];
  let cur = leaf;
  while (chain.length < MAX_THREAD && cur.in_reply_to_status_id_str && cur.in_reply_to_screen_name?.toLowerCase() === author) {
    try {
      cur = cur.parent?.id_str === cur.in_reply_to_status_id_str && cur.parent.user ? cur.parent : await fetchTweet(cur.in_reply_to_status_id_str);
    } catch {
      break; // a missing ancestor ends the thread rather than failing the request
    }
    if (cur.user.screen_name.toLowerCase() !== author) break;
    chain.push(cur);
  }
  return chain.reverse().map(normalizeTweet);
}
