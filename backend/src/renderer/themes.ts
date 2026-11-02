export const themes = {
  light: { bg: "#ffffff", text: "#0f1419", muted: "#536471", border: "#cfd9de", subtle: "#eff3f4", accent: "#1d9bf0", media: "#f7f9f9" },
  dark: { bg: "#000000", text: "#e7e9ea", muted: "#71767b", border: "#2f3336", subtle: "#16181c", accent: "#1d9bf0", media: "#16181c" },
} as const;
export type Theme = (typeof themes)[keyof typeof themes];
