export const themes = {
  light: { bg: "#ffffff", text: "#0f1419", muted: "#536471", border: "#eff3f4", accent: "#1d9bf0" },
  dark: { bg: "#000000", text: "#e7e9ea", muted: "#71767b", border: "#2f3336", accent: "#1d9bf0" },
} as const;
export type Theme = (typeof themes)[keyof typeof themes];
