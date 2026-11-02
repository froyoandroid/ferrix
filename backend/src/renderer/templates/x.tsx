import type { NormalizedPost, RenderOptions } from "@ferrix/shared";
import type { Theme } from "../themes";

function formatTimestamp(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${time} · ${date}`;
}

export function XCard({ post, options, theme }: { post: NormalizedPost; options: RenderOptions; theme: Theme }) {
  const { author } = post;
  const showIdentity = options.attribution !== "clean";
  const showAvatar = options.attribution === "original";
  const ts = options.attribution === "original" ? formatTimestamp(post.timestamp) : null;
  const initial = (author.name ?? author.username ?? "?").slice(0, 1).toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        padding: 24,
        backgroundColor: theme.bg,
        color: theme.text,
        fontFamily: "Inter",
        gap: 12,
      }}
    >
      {showIdentity && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {showAvatar &&
            (author.avatarUrl ? (
              <img src={author.avatarUrl} width={48} height={48} style={{ borderRadius: 9999 }} />
            ) : (
              <div
                style={{
                  display: "flex",
                  width: 48,
                  height: 48,
                  borderRadius: 9999,
                  backgroundColor: theme.border,
                  color: theme.muted,
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {initial}
              </div>
            ))}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 16, fontWeight: 700 }}>
              {author.name ?? author.username}
              {author.verified === true && (
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="11" fill={theme.accent} />
                  <path d="M7 12.5l3 3 7-7" stroke="#fff" stroke-width="2.4" fill="none" />
                </svg>
              )}
            </div>
            {author.username && <div style={{ display: "flex", fontSize: 15, color: theme.muted }}>{`@${author.username}`}</div>}
          </div>
        </div>
      )}
      <div style={{ display: "flex", fontSize: 20, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {post.content.text}
      </div>
      {ts && <div style={{ display: "flex", fontSize: 15, color: theme.muted }}>{ts}</div>}
    </div>
  );
}
