import type { RenderOptions } from "@ferrix/shared";
import type { Theme } from "../themes";
import type { ResolvedPost } from "../resolve";
import { RichText } from "../richtext";
import { Avatar, MediaGrid, NameLine, shortDate } from "./x";

const PAD = 20;
const AVATAR = 40;
const COL_GAP = 12;

/** One post as a row in an X conversation: avatar column with connector line, content column. */
export function XThreadItem({
  post,
  options,
  theme,
  number,
  connectAbove,
  connectBelow,
}: {
  post: ResolvedPost;
  options: RenderOptions;
  theme: Theme;
  number?: string;
  connectAbove: boolean;
  connectBelow: boolean;
}) {
  const original = options.attribution === "original";
  const showIdentity = options.attribution !== "clean";
  const date = original ? shortDate(post.timestamp, options.timeZone) : null;
  const leftCol = original ? AVATAR + COL_GAP : 0;
  const contentWidth = options.width - PAD * 2 - leftCol - 2;
  const line = { display: "flex", width: 2, backgroundColor: theme.border } as const;

  return (
    <div style={{ display: "flex", width: "100%", padding: `0 ${PAD}px`, backgroundColor: theme.bg, color: theme.text, fontFamily: "Inter" }}>
      {original && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: AVATAR, marginRight: COL_GAP }}>
          <div style={{ ...line, height: 12, opacity: connectAbove ? 1 : 0 }} />
          <Avatar post={post} size={AVATAR} theme={theme} />
          <div style={{ ...line, flexGrow: 1, marginTop: 4, opacity: connectBelow ? 1 : 0 }} />
        </div>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexGrow: 1,
          width: contentWidth,
          gap: 8,
          paddingTop: 12,
          paddingBottom: 16,
          ...(original ? {} : { borderBottom: connectBelow ? `1px solid ${theme.border}` : "none" }),
        }}
      >
        {(showIdentity || number) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 15 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {showIdentity && <NameLine post={post} theme={theme} fontSize={15} />}
              {showIdentity && post.author.username && post.author.name && (
                <div style={{ display: "flex", color: theme.muted }}>{`@${post.author.username}`}</div>
              )}
              {date && <div style={{ display: "flex", color: theme.muted }}>{`· ${date}`}</div>}
            </div>
            {number && <div style={{ display: "flex", color: theme.muted }}>{number}</div>}
          </div>
        )}
        {post.content.text.trim() && <RichText text={post.content.text} theme={theme} fontSize={17} />}
        <MediaGrid media={post.resolvedMedia} width={contentWidth} theme={theme} />
      </div>
    </div>
  );
}

export function XThreadFrame({ children, theme, width }: { children: unknown; theme: Theme; width: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width, paddingTop: 8, paddingBottom: 8, backgroundColor: theme.bg }}>
      {children as never}
    </div>
  );
}
