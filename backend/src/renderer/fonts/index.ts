import type { Font } from "satori";

const file = (weight: number) =>
  Bun.file(
    new URL(
      import.meta.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`),
    ),
  ).arrayBuffer();

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
