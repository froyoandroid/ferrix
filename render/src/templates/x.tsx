import type { RenderOptions } from "@ferrix/shared";
import type { Theme } from "../themes";
import { type ResolvedMedia, type ResolvedPost, type ResolvedQuote } from "../resolve";
import { RichText } from "../richtext";

export const X_PADDING = 24;
const GAP = 2;
const RADIUS = 16;

const X_LOGO =
  "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";

const TWITTER_BIRD =
  "M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z";

/** "daekawa" -> "da****wa": keep the ends, hide the middle. */
export function maskHandle(u: string) {
  const c = Array.from(u);
  if (c.length <= 2) return `${c[0] ?? ""}****`;
  const keep = c.length >= 7 ? 2 : 1;
  return `${c.slice(0, keep).join("")}****${c.slice(-keep).join("")}`;
}

export function handle(post: { author: { username?: string } }, options: RenderOptions) {
  const u = post.author.username;
  if (!u) return null;
  return "@" + (options.maskUsername ? maskHandle(u) : u);
}

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

function PlatformLogo({ theme, kind, size = 22 }: { theme: Theme; kind: RenderOptions["logo"]; size?: number }) {
  if (kind === "none") return null;
  const s = kind === "twitter" ? size + 2 : size;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24">
      <path fill={kind === "twitter" ? "#1D9BF0" : theme.text} d={kind === "twitter" ? TWITTER_BIRD : X_LOGO} />
    </svg>
  );
}

const METRIC_ICONS = {
  replies:
    "M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z",
  reposts:
    "M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z",
  likes:
    "M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z",
  bookmarks:
    "M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z",
  views: "M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z",
} as const;
const METRIC_ORDER = ["replies", "reposts", "likes", "bookmarks", "views"] as const;
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** X-style engagement row; only metrics present on the post are drawn. */
export function MetricsRow({ metrics, theme, fontSize = 15 }: { metrics: ResolvedPost["metrics"]; theme: Theme; fontSize?: number }) {
  const shown = METRIC_ORDER.filter((k) => metrics?.[k] !== undefined);
  if (!shown.length) return null;
  const icon = Math.round(fontSize * 1.25);
  return (
    <div style={{ display: "flex", flexGrow: 1, justifyContent: shown.length > 2 ? "space-between" : "flex-start", gap: 28, color: theme.muted, fontSize }}>
      {shown.map((k) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width={icon} height={icon} viewBox="0 0 24 24">
            <path fill={theme.muted} d={METRIC_ICONS[k]} />
          </svg>
          {compact.format(metrics![k]!)}
        </div>
      ))}
    </div>
  );
}

type MediaOpts = Pick<RenderOptions, "mediaAspect" | "altText">;
const ASPECT: Record<Exclude<RenderOptions["mediaAspect"], "auto">, number> = { "16:9": 9 / 16, "3:2": 2 / 3, "1:1": 1, "4:5": 5 / 4 };

/** Cover-fit by hand so the crop can follow the focus point (Satori has no object-position). */
function CoverImage({ m, w, h }: { m: ResolvedMedia; w: number; h: number }) {
  const img = m.img!;
  const scale = Math.max(w / img.width, h / img.height);
  const dw = Math.ceil(img.width * scale);
  const dh = Math.ceil(img.height * scale);
  const left = -Math.round((dw - w) * (m.focusX ?? 0.5));
  const top = -Math.round((dh - h) * (m.focusY ?? 0.5));
  return <img src={img.src} width={dw} height={dh} style={{ position: "absolute", left, top }} />;
}

function Badge({ children, left }: { children: string; left: number }) {
  return (
    <div style={{ display: "flex", position: "absolute", left, bottom: 10, padding: "2px 6px", borderRadius: 4, backgroundColor: "rgba(0,0,0,0.75)", color: "#fff", fontSize: 13, fontWeight: 700 }}>
      {children}
    </div>
  );
}

function MediaTile({ m, w, h, theme, opts }: { m: ResolvedMedia; w: number; h: number; theme: Theme; opts: MediaOpts }) {
  const alt = opts.altText === "badge" && Boolean(m.altText?.trim());
  return (
    <div style={{ display: "flex", position: "relative", width: w, height: h, backgroundColor: !m.img && m.type === "video" ? "#151515" : theme.media, overflow: "hidden" }}>
      {m.img ? (
        <CoverImage m={m} w={w} h={h} />
      ) : m.type === "video" ? null : (
        <div style={{ display: "flex", width: w, height: h, alignItems: "center", justifyContent: "center", color: theme.muted, fontSize: 14 }}>
          Media unavailable
        </div>
      )}
      {m.type === "gif" && <Badge left={10}>GIF</Badge>}
      {alt && <Badge left={m.type === "gif" ? 54 : 10}>ALT</Badge>}
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

/**
 * X-style media grid: 1 natural (clamped), 2 side by side, 3 one big + two stacked, 4 as 2x2.
 * A fixed mediaAspect sets the whole grid's frame; tiles cover-crop around each item's focus.
 */
export function MediaGrid({ media, width, theme, flush, options }: { media: ResolvedMedia[]; width: number; theme: Theme; flush?: boolean; options: MediaOpts }) {
  if (!media.length) return null;
  const n = media.length;
  let height: number;
  if (options.mediaAspect !== "auto") height = Math.round(width * ASPECT[options.mediaAspect]);
  else if (n === 1) {
    const m = media[0];
    const ratio = m.img ? m.img.height / m.img.width : m.height && m.width ? m.height / m.width : 9 / 16;
    height = Math.round(width * Math.min(Math.max(ratio, 0.5), 1.25));
  } else {
    height = Math.round((width * 9) / 16);
  }
  const half = Math.floor((width - GAP) / 2);
  const halfH = Math.floor((height - GAP) / 2);
  const tile = (i: number, w: number, h: number) => <MediaTile m={media[i]} w={w} h={h} theme={theme} opts={options} />;

  let body;
  if (n === 1) body = tile(0, width, height);
  else if (n === 2)
    body = (
      <div style={{ display: "flex", gap: GAP }}>
        {tile(0, half, height)}
        {tile(1, half, height)}
      </div>
    );
  else if (n === 3)
    body = (
      <div style={{ display: "flex", gap: GAP }}>
        {tile(0, half, height)}
        <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
          {tile(1, half, halfH)}
          {tile(2, half, halfH)}
        </div>
      </div>
    );
  else
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
        <div style={{ display: "flex", gap: GAP }}>
          {tile(0, half, halfH)}
          {tile(1, half, halfH)}
        </div>
        <div style={{ display: "flex", gap: GAP }}>
          {tile(2, half, halfH)}
          {tile(3, half, halfH)}
        </div>
      </div>
    );

  const grid = (
    <div style={flush ? { display: "flex", width } : { display: "flex", borderRadius: RADIUS, border: `1px solid ${theme.border}`, overflow: "hidden", width: width + 2 }}>
      {body}
    </div>
  );
  const captions = options.altText === "caption" ? media.map((m, i) => ({ i, t: m.altText?.trim() })).filter((c) => c.t) : [];
  if (!captions.length) return grid;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {grid}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: theme.muted, padding: flush ? "0 12px 10px" : "0 2px" }}>
        {captions.map((c) => (
          <div key={c.i} style={{ display: "flex" }}>{`${n > 1 ? `Image ${c.i + 1}: ` : "Alt: "}${c.t}`}</div>
        ))}
      </div>
    </div>
  );
}

export function NameLine({ post, theme, options, fontSize = 16 }: { post: ResolvedPost | ResolvedQuote; theme: Theme; options: RenderOptions; fontSize?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize, fontWeight: 700 }}>
      {post.author.name ?? handle(post, options) ?? ""}
      {post.author.verified === true && <VerifiedBadge theme={theme} size={Math.round(fontSize * 1.1)} />}
    </div>
  );
}

/** Embedded quote post: bordered box with compact header, text and media. */
export function QuoteCard({ quote, options, theme, width }: { quote: ResolvedQuote; options: RenderOptions; theme: Theme; width: number }) {
  const showIdentity = options.attribution !== "clean";
  const original = options.attribution === "original";
  const date = original && options.showDate ? shortDate(quote.timestamp, options.timeZone) : null;
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
              <NameLine post={quote} theme={theme} options={options} fontSize={15} />
              {quote.author.username && quote.author.name && (
                <div style={{ display: "flex", color: theme.muted }}>{handle(quote, options)}</div>
              )}
              {date && <div style={{ display: "flex", color: theme.muted }}>{`· ${date}`}</div>}
            </div>
          )}
          {hasText && <RichText text={quote.content.text} theme={theme} fontSize={15} />}
        </div>
      )}
      {quote.resolvedMedia.length > 0 && <QuoteMedia media={quote.resolvedMedia} width={inner} theme={theme} options={options} />}
    </div>
  );
}

function QuoteMedia({ media, width, theme, options }: { media: ResolvedMedia[]; width: number; theme: Theme; options: MediaOpts }) {
  // Same grid as the main post but borderless and square-cornered, flush with the quote box.
  return (
    <div style={{ display: "flex", marginTop: -1, marginLeft: -1 }}>
      <MediaGrid media={media} width={width} theme={theme} flush options={options} />
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
  const ts = original && options.showDate ? formatTimestamp(post.timestamp, options.timeZone) : null;
  const logo = showIdentity && options.logo !== "none";
  const contentWidth = options.width - X_PADDING * 2 - 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: X_PADDING, backgroundColor: theme.bg, color: theme.text, fontFamily: "Inter", gap: 12 }}>
      {(showIdentity || badge || logo) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {original && <Avatar post={post} size={48} theme={theme} />}
            {showIdentity && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <NameLine post={post} theme={theme} options={options} />
                {post.author.username && post.author.name && (
                  <div style={{ display: "flex", fontSize: 15, color: theme.muted }}>{handle(post, options)}</div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {badge && <div style={{ display: "flex", fontSize: 15, color: theme.muted }}>{badge}</div>}
            {logo && <PlatformLogo theme={theme} kind={options.logo} />}
          </div>
        </div>
      )}
      {post.content.text.trim() && <RichText text={post.content.text} theme={theme} fontSize={20} />}
      <MediaGrid media={post.resolvedMedia} width={contentWidth} theme={theme} options={options} />
      {post.resolvedQuote && <QuoteCard quote={post.resolvedQuote} options={options} theme={theme} width={contentWidth + 2} />}
      {ts && <div style={{ display: "flex", fontSize: 15, color: theme.muted }}>{ts}</div>}
      {options.showMetrics && post.metrics && (
        <div style={{ display: "flex", paddingTop: 12, borderTop: `1px solid ${theme.border}` }}>
          <MetricsRow metrics={post.metrics} theme={theme} />
        </div>
      )}
    </div>
  );
}
