import type { MediaItem, NormalizedPost } from "@ferrix/shared";
import type { SynTweet } from "./syndication";

const decodeEntities = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** Visible text: honour display_text_range (code points), expand t.co links, drop trailing media links. */
function visibleText(t: SynTweet): string {
  const chars = Array.from(t.text);
  const [start, end] = t.display_text_range ?? [0, chars.length];
  const replacements = new Map<number, { end: number; text: string }>();
  for (const u of t.entities?.urls ?? []) replacements.set(u.indices[0], { end: u.indices[1], text: u.expanded_url ?? u.display_url });
  for (const m of t.entities?.media ?? []) replacements.set(m.indices[0], { end: m.indices[1], text: "" });

  let out = "";
  for (let i = start; i < end; ) {
    const r = replacements.get(i);
    if (r) {
      out += r.text;
      i = r.end;
    } else out += chars[i++];
  }
  return decodeEntities(out).trim();
}

function largePhoto(url: string) {
  const u = new URL(url);
  const ext = /\.(jpe?g|png|webp)$/i.exec(u.pathname)?.[1] ?? "jpg";
  u.pathname = u.pathname.replace(/\.(jpe?g|png|webp)$/i, "");
  u.search = `?format=${ext.toLowerCase() === "jpeg" ? "jpg" : ext.toLowerCase()}&name=large`;
  return u.toString();
}

function media(t: SynTweet): MediaItem[] {
  return (t.mediaDetails ?? []).slice(0, 4).map((m) => {
    const dims = m.original_info ? { width: m.original_info.width, height: m.original_info.height } : {};
    if (m.type === "photo") return { type: "image", url: largePhoto(m.media_url_https), altText: m.ext_alt_text, ...dims };
    return { type: "video", thumbnailUrl: m.media_url_https, altText: m.ext_alt_text, ...dims };
  });
}

export function normalizeTweet(t: SynTweet): NormalizedPost {
  const avatar = t.user.profile_image_url_https?.replace(/_normal(\.\w+)$/, "_400x400$1");
  return {
    platform: "x",
    sourceUrl: `https://x.com/${t.user.screen_name}/status/${t.id_str}`,
    postId: t.id_str,
    author: {
      name: t.user.name,
      username: t.user.screen_name,
      avatarUrl: avatar,
      verified: Boolean(t.user.is_blue_verified || t.user.verified),
    },
    content: { text: visibleText(t), media: media(t) },
    timestamp: new Date(t.created_at).toISOString(),
  };
}
