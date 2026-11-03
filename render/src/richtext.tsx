import type { CSSProperties } from "react";
import type { Theme } from "./themes";
import { visualTokens } from "./bidi";

const URL_RE = /^https?:\/\/\S+/;
const ENTITY_RE = /^[@#$][\p{L}\p{N}_]+/u;

/**
 * Satori has no inline layout, so text is split into lines, and lines into
 * word tokens laid out with flex-wrap. Links, mentions, hashtags and cashtags
 * get the platform accent colour.
 */
export function RichText({ text, theme, fontSize }: { text: string; theme: Theme; fontSize: number }) {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  const lineHeight = Math.round(fontSize * 1.35);
  return (
    <div style={{ display: "flex", flexDirection: "column", fontSize, lineHeight: `${lineHeight}px` }}>
      {lines.map((line, i) => {
        const { tokens, rtl } = visualTokens(line.match(/\s*\S+\s*/g) ?? []);
        return (
        <div key={i} style={{ display: "flex", flexWrap: "wrap", flexDirection: rtl ? "row-reverse" : "row", minHeight: lineHeight }}>
          {tokens.flatMap((tok, j) => {
            const word = tok.trim();
            const long = word.length > 20;
            const base: CSSProperties = long
              ? { whiteSpace: "pre-wrap", wordBreak: "break-all", maxWidth: "100%" }
              : { whiteSpace: "pre" };
            if (!(URL_RE.test(word) || ENTITY_RE.test(word)))
              return [<span key={j} style={{ ...base, color: theme.text }}>{tok}</span>];
            // Keep trailing punctuation (and for entities, anything after the handle) in the text colour.
            const m = ENTITY_RE.test(word) && !URL_RE.test(word)
              ? /^(\s*)([@#$][\p{L}\p{N}_]+)(.*)$/su.exec(tok)!
              : /^(\s*)(\S+?)([.,!?;:)\]'"’”…]*\s*)$/su.exec(tok)!;
            return [
              <span key={`${j}a`} style={{ ...base, color: theme.accent }}>{m[1] + m[2]}</span>,
              ...(m[3] ? [<span key={`${j}b`} style={{ whiteSpace: "pre", color: theme.text }}>{m[3]}</span>] : []),
            ];
          })}
        </div>
        );
      })}
    </div>
  );
}
