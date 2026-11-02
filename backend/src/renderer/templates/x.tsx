import type { RenderOptions } from "@ferrix/shared";
import type { Theme } from "../themes";
import { KEY_COLOR, type ResolvedMedia, type ResolvedPost, type ResolvedQuote } from "../resolve";
import { RichText } from "../richtext";

export const X_PADDING = 24;
const GAP = 2;
const RADIUS = 16;

const X_LOGO =
  "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";

export function formatTimestamp(iso: string | undefined, timeZone: string) {
  if (!iso) return null;
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
  return `${time} · ${date}`;
}

export function shortDate(iso: string | undefined, timeZone: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone });
}

export function Avatar({ post, size, theme }: { post: ResolvedPost | ResolvedQuote; size: number; theme: Theme }) {
  if (post.avatar)
    return <img src={post.avatar.src} width={size} height={size} style={{ borderRadius: 9999, objectFit: "cover" }} />;
  const initial = (post.author.name ?? post.author.username ?? "?").slice(0, 1).toUpperCase();
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        borderRadius: 9999,
        backgroundColor: theme.subtle,
        color: theme.muted,
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

export function VerifiedBadge({ theme, size = 18 }: { theme: Theme; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        fill={theme.accent}
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
      />
      <path fill="#fff" d="M10.54 16.2 6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36z" />
    </svg>
  );
}

function XLogo({ theme, size = 22 }: { theme: Theme; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill={theme.text} d={X_LOGO} />
    </svg>
  );
}

function MediaTile({ m, w, h, theme }: { m: ResolvedMedia; w: number; h: number; theme: Theme }) {
  if (m.key) return <div style={{ display: "flex", width: w, height: h, backgroundColor: KEY_COLOR }} />;
  return (
    <div style={{ display: "flex", position: "relative", width: w, height: h, backgroundColor: theme.media, overflow: "hidden" }}>
      {m.img ? (
        <img src={m.img.src} width={w} height={h} style={{ objectFit: "cover" }} />
      ) : (
        <div style={{ display: "flex", width: w, height: h, alignItems: "center", justifyContent: "center", color: theme.muted, fontSize: 14 }}>
          Media unavailable
        </div>
      )}
      {m.type === "gif" && (
        <div style={{ display: "flex", position: "absolute", left: 10, bottom: 10, padding: "2px 6px", borderRadius: 4, backgroundColor: "rgba(0,0,0,0.75)", color: "#fff", fontSize: 13, fontWeight: 700 }}>
          GIF
        </div>
      )}
      {m.type === "video" && (
        <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: w, height: h, alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", width: 56, height: 56, borderRadius: 9999, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center", border: "3px solid #fff" }}>
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path fill="#fff" d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

/** X-style media grid: 1 natural (clamped), 2 side by side, 3 one big + two stacked, 4 as 2×2. */
export function MediaGrid({ media, width, theme, flush }: { media: ResolvedMedia[]; width: number; theme: Theme; flush?: boolean }) {
  if (!media.length) return null;
  const n = media.length;
  let height: number;
  if (n === 1) {
    const m = media[0];
    const ratio = m.img ? m.img.height / m.img.width : m.height && m.width ? m.height / m.width : 9 / 16;
    height = Math.round(width * Math.min(Math.max(ratio, 0.5), 1.25));
  } else {
    height = Math.round((width * 9) / 16);
  }
  const half = (width - GAP) / 2;
  const halfH = (height - GAP) / 2;

  let body;
  if (n === 1) body = <MediaTile m={media[0]} w={width} h={height} theme={theme} />;
  else if (n === 2)
    body = (
      <div style={{ display: "flex", gap: GAP }}>
        <MediaTile m={media[0]} w={half} h={height} theme={theme} />
        <MediaTile m={media[1]} w={half} h={height} theme={theme} />
      </div>
    );
  else if (n === 3)
    body = (
      <div style={{ display: "flex", gap: GAP }}>
        <MediaTile m={media[0]} w={half} h={height} theme={theme} />
        <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
          <MediaTile m={media[1]} w={half} h={halfH} theme={theme} />
          <MediaTile m={media[2]} w={half} h={halfH} theme={theme} />
        </div>
      </div>
    );
  else
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
        <div style={{ display: "flex", gap: GAP }}>
          <MediaTile m={media[0]} w={half} h={halfH} theme={theme} />
          <MediaTile m={media[1]} w={half} h={halfH} theme={theme} />
        </div>
        <div style={{ display: "flex", gap: GAP }}>
          <MediaTile m={media[2]} w={half} h={halfH} theme={theme} />
          <MediaTile m={media[3]} w={half} h={halfH} theme={theme} />
        </div>
      </div>
    );

  return (
    <div style={flush ? { display: "flex", width } : { display: "flex", borderRadius: RADIUS, border: `1px solid ${theme.border}`, overflow: "hidden", width: width + 2 }}>
      {body}
    </div>
  );
}

export function NameLine({ post, theme, fontSize = 16 }: { post: ResolvedPost | ResolvedQuote; theme: Theme; fontSize?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize, fontWeight: 700 }}>
      {post.author.name ?? (post.author.username ? `@${post.author.username}` : "")}
      {post.author.verified === true && <VerifiedBadge theme={theme} size={Math.round(fontSize * 1.1)} />}
    </div>
  );
}

/** Embedded quote post: bordered box with compact header, text and media. */
export function QuoteCard({ quote, options, theme, width }: { quote: ResolvedQuote; options: RenderOptions; theme: Theme; width: number }) {
  const showIdentity = options.attribution !== "clean";
  const original = options.attribution === "original";
  const date = original ? shortDate(quote.timestamp, options.timeZone) : null;
  const inner = width - 2;
  const hasText = Boolean(quote.content.text.trim());
  return (
    <div style={{ display: "flex", flexDirection: "column", width, border: `1px solid ${theme.border}`, borderRadius: RADIUS, overflow: "hidden" }}>
      {(showIdentity || hasText) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 12 }}>
          {showIdentity && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 15 }}>
              {original && (
                <div style={{ display: "flex", marginRight: 4 }}>
                  <Avatar post={quote} size={20} theme={theme} />
                </div>
              )}
              <NameLine post={quote} theme={theme} fontSize={15} />
              {quote.author.username && quote.author.name && (
                <div style={{ display: "flex", color: theme.muted }}>{`@${quote.author.username}`}</div>
              )}
              {date && <div style={{ display: "flex", color: theme.muted }}>{`· ${date}`}</div>}
            </div>
          )}
          {hasText && <RichText text={quote.content.text} theme={theme} fontSize={15} />}
        </div>
      )}
      {quote.resolvedMedia.length > 0 && <QuoteMedia media={quote.resolvedMedia} width={inner} theme={theme} />}
    </div>
  );
}

function QuoteMedia({ media, width, theme }: { media: ResolvedMedia[]; width: number; theme: Theme }) {
  // Same grid as the main post but borderless and square-cornered, flush with the quote box.
  return (
    <div style={{ display: "flex", marginTop: -1, marginLeft: -1 }}>
      <MediaGrid media={media} width={width} theme={theme} flush />
    </div>
  );
}

/** Single post, X detail-view style. */
export function XCard({
  post,
  options,
  theme,
  badge,
}: {
  post: ResolvedPost;
  options: RenderOptions;
  theme: Theme;
  badge?: string;
}) {
  const showIdentity = options.attribution !== "clean";
  const original = options.attribution === "original";
  const ts = original ? formatTimestamp(post.timestamp, options.timeZone) : null;
  const contentWidth = options.width - X_PADDING * 2 - 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: X_PADDING, backgroundColor: theme.bg, color: theme.text, fontFamily: "Inter", gap: 12 }}>
      {(showIdentity || badge) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {original && <Avatar post={post} size={48} theme={theme} />}
            {showIdentity && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <NameLine post={post} theme={theme} />
                {post.author.username && post.author.name && (
                  <div style={{ display: "flex", fontSize: 15, color: theme.muted }}>{`@${post.author.username}`}</div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {badge && <div style={{ display: "flex", fontSize: 15, color: theme.muted }}>{badge}</div>}
            {original && <XLogo theme={theme} />}
          </div>
        </div>
      )}
      {post.content.text.trim() && <RichText text={post.content.text} theme={theme} fontSize={20} />}
      <MediaGrid media={post.resolvedMedia} width={contentWidth} theme={theme} />
      {post.resolvedQuote && <QuoteCard quote={post.resolvedQuote} options={options} theme={theme} width={contentWidth + 2} />}
      {ts && <div style={{ display: "flex", fontSize: 15, color: theme.muted }}>{ts}</div>}
    </div>
  );
}
