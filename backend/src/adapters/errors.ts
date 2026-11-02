export type ExtractErrorCode =
  | "unsupported_url"
  | "not_found"
  | "unavailable"
  | "rate_limited"
  | "upstream_error";

export class ExtractError extends Error {
  constructor(public code: ExtractErrorCode, message: string) {
    super(message);
  }
}
