/**
 * Writing systems outside Latin/Greek/Cyrillic, mapped to the Noto family that covers them.
 * Satori reports a language code for text its fonts cannot draw; "unknown" is narrowed here by
 * Unicode script. Families are an allowlist: the font endpoint serves nothing else.
 */
export interface ScriptFont {
  family: string;
  weights: number[];
}

const both = [400, 700];
const regular = [400];

export const SCRIPT_FAMILIES: Record<string, number[]> = {
  "Noto Sans SC": both,
  "Noto Sans TC": both,
  "Noto Sans HK": both,
  "Noto Sans JP": both,
  "Noto Sans KR": both,
  "Noto Sans Thai": both,
  "Noto Sans Lao": both,
  "Noto Sans Khmer": both,
  "Noto Sans Myanmar": both,
  "Noto Sans Devanagari": both,
  "Noto Sans Bengali": both,
  "Noto Sans Gurmukhi": both,
  "Noto Sans Gujarati": both,
  "Noto Sans Oriya": both,
  "Noto Sans Tamil": both,
  "Noto Sans Telugu": both,
  "Noto Sans Kannada": both,
  "Noto Sans Malayalam": both,
  "Noto Sans Sinhala": both,
  "IBM Plex Sans Arabic": both,
  "Noto Sans Hebrew": both,
  "Noto Sans Armenian": both,
  "Noto Sans Georgian": both,
  "Noto Sans Ethiopic": both,
  "Noto Serif Tibetan": both,
  "Noto Sans Symbols": both,
  "Noto Sans Symbols 2": regular,
  "Noto Sans Math": regular,
};

const BY_CODE: Record<string, string> = {
  "zh-CN": "Noto Sans SC",
  "zh-TW": "Noto Sans TC",
  "zh-HK": "Noto Sans HK",
  "ja-JP": "Noto Sans JP",
  "ko-KR": "Noto Sans KR",
  "th-TH": "Noto Sans Thai",
  "bn-IN": "Noto Sans Bengali",
  "ar-AR": "IBM Plex Sans Arabic",
  "ta-IN": "Noto Sans Tamil",
  "ml-IN": "Noto Sans Malayalam",
  "he-IL": "Noto Sans Hebrew",
  "te-IN": "Noto Sans Telugu",
  devanagari: "Noto Sans Devanagari",
  kannada: "Noto Sans Kannada",
  symbol: "Noto Sans Symbols 2",
  math: "Noto Sans Math",
};

const BY_SCRIPT: [RegExp, string][] = [
  [/\p{Script=Hangul}/u, "Noto Sans KR"],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, "Noto Sans JP"],
  [/\p{Script=Han}/u, "Noto Sans SC"],
  // CJK punctuation and full-width forms (、。「」！？) appear in Chinese and Japanese alike.
  [/[\u3000-\u303F\uFF00-\uFFEF]/u, "Noto Sans JP"],
  [/\p{Script=Thai}/u, "Noto Sans Thai"],
  [/\p{Script=Lao}/u, "Noto Sans Lao"],
  [/\p{Script=Khmer}/u, "Noto Sans Khmer"],
  [/\p{Script=Myanmar}/u, "Noto Sans Myanmar"],
  [/\p{Script=Devanagari}/u, "Noto Sans Devanagari"],
  [/\p{Script=Bengali}/u, "Noto Sans Bengali"],
  [/\p{Script=Gurmukhi}/u, "Noto Sans Gurmukhi"],
  [/\p{Script=Gujarati}/u, "Noto Sans Gujarati"],
  [/\p{Script=Oriya}/u, "Noto Sans Oriya"],
  [/\p{Script=Tamil}/u, "Noto Sans Tamil"],
  [/\p{Script=Telugu}/u, "Noto Sans Telugu"],
  [/\p{Script=Kannada}/u, "Noto Sans Kannada"],
  [/\p{Script=Malayalam}/u, "Noto Sans Malayalam"],
  [/\p{Script=Sinhala}/u, "Noto Sans Sinhala"],
  [/\p{Script=Arabic}/u, "IBM Plex Sans Arabic"],
  [/\p{Script=Hebrew}/u, "Noto Sans Hebrew"],
  [/\p{Script=Armenian}/u, "Noto Sans Armenian"],
  [/\p{Script=Georgian}/u, "Noto Sans Georgian"],
  [/\p{Script=Ethiopic}/u, "Noto Sans Ethiopic"],
  [/\p{Script=Tibetan}/u, "Noto Serif Tibetan"],
];

/** The families to try for a segment Satori could not draw, most specific first. */
export function scriptFonts(code: string, segment: string): ScriptFont[] {
  const names = new Set<string>();
  // Satori labels all Han text zh-CN unless told otherwise; Japanese kana in the segment means JP.
  if (code.startsWith("zh") && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(segment)) names.add("Noto Sans JP");
  if (BY_CODE[code]) names.add(BY_CODE[code]);
  for (const [re, name] of BY_SCRIPT) if (re.test(segment)) names.add(name);
  if (code === "unknown" || code === "symbol") names.add("Noto Sans Symbols");
  return [...names].map((family) => ({ family, weights: SCRIPT_FAMILIES[family] }));
}

/** Han and Hangul fonts are huge, so they come as per-text subsets; every other script loads whole (tens of KB) so its shaping tables stay complete. */
export const SUBSET_FAMILIES = new Set(["Noto Sans SC", "Noto Sans TC", "Noto Sans HK", "Noto Sans JP", "Noto Sans KR"]);

/** Characters of a segment, deduplicated and sorted, so subsets cache well. */
export const subsetText = (segment: string) => [...new Set([...segment.replace(/\s/g, "")])].sort().join("");
