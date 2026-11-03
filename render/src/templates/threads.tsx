import type { RenderOptions } from "@ferrix/shared";
import type { Theme } from "../themes";
import type { ResolvedPost } from "../resolve";
import { RichText } from "../richtext";
import { Avatar, MediaGrid, handle, maskHandle } from "./x";

const PADDING = 24;

// Threads wordmark glyph (the "@" mark).
const THREADS_LOGO =
  "M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z";

const ICONS = {
  likes: "M12 21.2l-1.4-1.3C5.4 15.3 2 12.2 2 8.4 2 5.3 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.3 22 8.4c0 3.8-3.4 6.9-8.6 11.5L12 21.2zM7.5 5C5.5 5 4 6.5 4 8.4c0 2.8 2.9 5.5 7.4 9.6l.6.5.6-.5C17.1 13.9 20 11.2 20 8.4 20 6.5 18.5 5 16.5 5c-1.4 0-2.8.9-3.4 2.2h-2.2C10.3 5.9 8.9 5 7.5 5z",
  replies: "M12 3a9 9 0 0 0-8 13.1L3 21l4.9-1.1A9 9 0 1 0 12 3zm0 16a7 7 0 0 1-3.6-1l-.3-.2-2.5.6.6-2.4-.2-.3A7 7 0 1 1 12 19z",
  reposts: "M7 7h9.6l-2.3-2.3L15.7 3.3 20.4 8l-4.7 4.7-1.4-1.4L16.6 9H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5zm10 10H7.4l2.3 2.3-1.4 1.4L3.6 16l4.7-4.7 1.4 1.4L7.4 15H17a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5z",
  shares: "M21.7 2.3a1 1 0 0 0-1-.2l-18 6.5a1 1 0 0 0-.1 1.8l7.7 3.4 3.4 7.7a1 1 0 0 0 .9.6h.1a1 1 0 0 0 .9-.7l6.5-18a1 1 0 0 0-.4-1.1zM14 17.6l-2.2-5 4.4-4.4-1.4-1.4-4.4 4.4-5-2.2L18.9 5 14 17.6z",
} as const;
const ORDER = ["likes", "replies", "reposts", "shares"] as const;
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function Verified({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path fill="#0095f6" d="M12 1.5l2.6 1.9 3.2-.2 1 3 2.7 1.8-1 3 1 3-2.7 1.8-1 3-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3L2.5 16l1-3-1-3 2.7-1.8 1-3 3.2.2z" />
      <path fill="#fff" d="M10.6 15.6l-3.2-3.2 1.4-1.4 1.8 1.8 4.6-4.6 1.4 1.4z" />
    </svg>
  );
}

function threadsDate(iso: string | undefined, timeZone: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", timeZone });
}

/** Single post in Threads' own look: compact header, username-first identity, outlined action row. */
export function ThreadsCard({ post, options, theme, badge }: { post: ResolvedPost; options: RenderOptions; theme: Theme; badge?: string }) {
  const showIdentity = options.attribution !== "clean";
  const original = options.attribution === "original";
  const date = original && options.showDate ? threadsDate(post.timestamp, options.timeZone) : null;
  const logo = showIdentity && options.logo !== "none";
  const contentWidth = options.width - PADDING * 2 - 2;
  const name = post.author.username ? (options.maskUsername ? maskHandle(post.author.username) : post.author.username) : handle(post, options);
  const shown = ORDER.filter((k) => post.metrics?.[k] !== undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: PADDING, backgroundColor: theme.bg, color: theme.text, fontFamily: "Inter", gap: 10 }}>
      {(showIdentity || badge || logo) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}>
            {original && <Avatar post={post} size={40} theme={theme} />}
            {showIdentity && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ display: "flex", fontWeight: 700 }}>{name ?? ""}</div>
                {post.author.verified === true && <Verified size={16} />}
                {date && <div style={{ display: "flex", color: theme.muted, marginLeft: 4 }}>{date}</div>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {badge && <div style={{ display: "flex", fontSize: 15, color: theme.muted }}>{badge}</div>}
            {logo && (
              <svg width={22} height={22} viewBox="0 0 24 24">
                <path fill={theme.text} d={THREADS_LOGO} />
              </svg>
            )}
          </div>
        </div>
      )}
      {post.content.text.trim() && <RichText text={post.content.text} theme={theme} fontSize={18} />}
      <MediaGrid media={post.resolvedMedia} width={contentWidth} theme={theme} options={options} />
      {options.showMetrics && shown.length > 0 && (
        <div style={{ display: "flex", gap: 22, paddingTop: 4, color: theme.muted, fontSize: 15 }}>
          {shown.map((k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width={19} height={19} viewBox="0 0 24 24">
                <path fill={theme.muted} d={ICONS[k]} />
              </svg>
              {compact.format(post.metrics![k]!)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
