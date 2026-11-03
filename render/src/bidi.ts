/**
 * Minimal right-to-left support. The layout engine shapes Arabic words (and draws them in the
 * right order) but lays out words, Hebrew letters and lines left to right. This puts RTL text in
 * visual order: RTL words right to left, Hebrew letters reversed, neutral punctuation on the
 * reading side. It is an approximation of the Unicode bidi algorithm, good for ordinary posts.
 */
const RTL = /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;
const LETTER = /\p{L}/u;
/** Has a strong left-to-right letter (any letter outside the RTL scripts). */
const LTR = { test: (s: string) => [...s].some((c) => LETTER.test(c) && !RTL.test(c)) };
const HEBREW = /\p{Script=Hebrew}/u;
const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«" };

export const hasRtl = (s: string) => RTL.test(s);
const isRtlWord = (w: string) => RTL.test(w) && !LTR.test(w);

/** Paragraph direction from the first strong character. */
export function isRtlLine(line: string): boolean {
  for (const ch of line) {
    if (RTL.test(ch)) return true;
    if (LTR.test(ch)) return false;
  }
  return false;
}

const graphemes = (s: string) =>
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].map((g) => g.segment)
    : [...s];

const flipPunct = (p: string) => [...p].reverse().map((c) => MIRROR[c] ?? c).join("");

/**
 * One RTL word as visual pieces, left to right. Edge punctuation becomes its own piece: an Arabic
 * word only shapes right to left when it starts with an Arabic letter.
 */
export function visualPieces(word: string, neutral = false): string[] {
  if (!isRtlWord(word) && !neutral) return [word];
  const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su.exec(word)!;
  let core = m[2];
  if (HEBREW.test(core)) {
    // Reverse letters but keep digit runs readable left to right.
    core = core
      .split(/(\d+(?:[.,]\d+)*)/)
      .map((part, i) => (i % 2 ? part : graphemes(part).reverse().join("")))
      .reverse()
      .join("");
  }
  return [flipPunct(m[3]), core, flipPunct(m[1])].filter(Boolean);
}

/**
 * Tokens of one line, reordered so the layout shows them in visual order. For an RTL line the
 * caller lays the tokens out right to left (row-reverse), so tokens come back in logical order
 * there with only the LTR runs pre-reversed.
 */
export function visualTokens(tokens: string[]): { tokens: string[]; rtl: boolean } {
  const line = tokens.join("");
  if (!hasRtl(line)) return { tokens, rtl: false };
  const rtl = isRtlLine(line);
  const words = tokens.map((t) => {
    const m = /^(\s*)(.*?)(\s*)$/su.exec(t)!;
    return { lead: m[1], word: m[2], trail: m[3], r: isRtlWord(m[2]) };
  });
  const out: string[] = [];
  let run: typeof words = [];
  const emit = (w: (typeof words)[number], reversed: boolean) => {
    // Numbers and punctuation inside an RTL line follow it, brackets mirrored.
    const neutral = rtl && !w.r && !LTR.test(w.word);
    if (!w.r && !neutral) return void out.push(rtl ? w.trail + w.lead + w.word : w.lead + w.word + w.trail);
    const pieces = visualPieces(w.word, neutral); // visual left to right
    if (rtl) {
      // row-reverse draws these right to left: give them in reverse, the space leading the leftmost.
      const logical = [...pieces].reverse();
      logical[logical.length - 1] = w.trail + w.lead + logical[logical.length - 1];
      out.push(...logical);
    } else {
      pieces[0] = w.lead + pieces[0];
      pieces[pieces.length - 1] += w.trail;
      out.push(...pieces);
    }
    void reversed;
  };
  const flush = () => {
    for (const w of run.reverse()) emit(w, true);
    run = [];
  };
  for (const w of words) {
    const minority = rtl ? !w.r && LTR.test(w.word) : w.r;
    if (minority) run.push(w);
    else {
      flush();
      emit(w, false);
    }
  }
  flush();
  return { tokens: out, rtl };
}

/** A short plain string (a display name) in visual order. */
export function visualText(s: string): string {
  if (!hasRtl(s)) return s;
  const toks = s.match(/\s*\S+\s*/g) ?? [s];
  const { tokens, rtl } = visualTokens(toks);
  return rtl ? [...tokens].reverse().join("").trim() : tokens.join("");
}
