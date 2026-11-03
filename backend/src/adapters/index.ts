import type { NormalizedPost } from "@ferrix/shared";
import { ExtractError } from "./errors";
import { extractX, parseXUrl } from "./x";
import { extractThreads, parseThreadsUrl } from "./threads";

export { ExtractError };

export async function extract(url: string, opts: { thread?: boolean } = {}): Promise<NormalizedPost[]> {
  if (parseXUrl(url)) return extractX(url, opts);
  // Threads: single posts for now; the public embed carries no thread context.
  if (parseThreadsUrl(url)) return extractThreads(url);
  throw new ExtractError("unsupported_url", "Paste a public X or Threads post URL");
}
