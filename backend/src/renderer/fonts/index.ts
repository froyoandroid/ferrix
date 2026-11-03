import type { Font } from "satori";

const file = (weight: number) =>
  Bun.file(
    new URL(
      import.meta.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`),
    ),
  ).arrayBuffer();

let fallback: Promise<Font[]> | null = null;
/** Full Inter (render/fonts), for glyphs outside the latin subset such as CO\u2082. */
export function loadFallbackFonts(): Promise<Font[]> {
  const f = (w: number) => Bun.file(new URL(import.meta.resolve(`@ferrix/render/fonts/inter-full-${w}.ttf`))).arrayBuffer();
  fallback ??= Promise.all([f(400), f(700)]).then(([r, b]) => [
    { name: "Inter Full", data: r, weight: 400, style: "normal" },
    { name: "Inter Full", data: b, weight: 700, style: "normal" },
  ]);
  return fallback;
}

let cache: Font[] | null = null;
export async function loadFonts(): Promise<Font[]> {
  if (cache) return cache;
  const [regular, bold] = await Promise.all([file(400), file(700)]);
  cache = [
    { name: "Inter", data: regular, weight: 400, style: "normal" },
    { name: "Inter", data: bold, weight: 700, style: "normal" },
  ];
  return cache;
}
