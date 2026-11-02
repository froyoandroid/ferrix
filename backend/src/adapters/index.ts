import type { NormalizedPost } from "@ferrix/shared";
import { ExtractError } from "./errors";
import { extractX, parseXUrl } from "./x";

export { ExtractError };

export async function extract(url: string, opts: { thread?: boolean } = {}): Promise<NormalizedPost[]> {
  if (parseXUrl(url)) return extractX(url, opts);
  throw new ExtractError("unsupported_url", "Only X post URLs are supported right now");
}
