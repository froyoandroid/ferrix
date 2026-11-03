import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NormalizedPost, type AttributionPreset, type ThreadMode } from "@ferrix/shared";
import { z } from "zod";

type Post = z.infer<typeof NormalizedPost>;
type ThemeId = "light" | "dark" | "ferrix";
type Logo = "x" | "twitter" | "none";
type View = "home" | "editor" | "about";

const Input = z.union([NormalizedPost, z.array(NormalizedPost).min(1)]);

const sample: Post[] = [
  {
    platform: "x",
    sourceUrl: "https://x.com/ferrix/status/1",
    author: { name: "Ferrix", username: "ferrix" },
    content: { text: "The message outlives the messenger.", media: [] },
    timestamp: "2026-11-02T18:30:00.000Z",
    metrics: { replies: 12, reposts: 48, likes: 1280, views: 20400 },
  } as Post,
];

const THEMES: { id: ThemeId; name: string; note: string; swatch: [string, string] }[] = [
  { id: "light", name: "Paper", note: "Clean light", swatch: ["#ffffff", "#0f1419"] },
  { id: "dark", name: "Carbon", note: "Dark", swatch: ["#000000", "#e7e9ea"] },
  { id: "ferrix", name: "Ferrix", note: "Industrial vintage", swatch: ["#efe9df", "#a8502b"] },
];

type Detected = { platform: "x" | "threads"; supported: boolean } | null;
function detect(url: string): Detected {
  const u = url.trim();
  if (/^(https?:\/\/)?(www\.|mobile\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/i.test(u)) return { platform: "x", supported: true };
  if (/^(https?:\/\/)?(www\.)?threads\.(net|com)\//i.test(u)) return { platform: "threads", supported: false };
  return null;
}

/** Filename from the server's Content-Disposition, so downloads carry the post's identity. */
function fileName(res: Response, fallback: string) {
  return /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;
}

async function errorText(res: Response) {
  const body = await res.text();
  try {
    const j = JSON.parse(body);
    return typeof j.error === "string" ? j.error : JSON.stringify(j.error ?? j);
  } catch {
    return body || `Request failed (${res.status})`;
  }
}

const post = (path: string, body: unknown) =>
  fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

type Output = { kind: "png" | "zip"; url: string; name: string; count: number };
type Preview = { url: string; caption?: string };

export default function App() {
  const [view, setView] = useState<View>("home");
  const [posts, setPosts] = useState<Post[]>(sample);

  return (
    <div className="min-h-screen font-sans">
      <Header view={view} setView={setView} />
      {view === "home" && (
        <Home
          onLoaded={(p) => {
            setPosts(p);
            setView("editor");
          }}
          onJson={() => setView("editor")}
        />
      )}
      {view === "editor" && <Editor posts={posts} setPosts={setPosts} onNew={() => setView("home")} />}
      {view === "about" && <About onStart={() => setView("home")} />}
    </div>
  );
}

function Mark({ size = 22 }: { size?: number }) {
  // Monogram: an F cut from a solid plate.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="5" fill="#1b1a18" />
      <path d="M7 6h10v3H10.5v2.5H16v3h-5.5V18H7z" fill="#a8502b" />
    </svg>
  );
}

function Header({ view, setView }: { view: View; setView: (v: View) => void }) {
  const link = (v: View, label: string) => (
    <button
      onClick={() => setView(v)}
      className={`text-sm transition-colors ${view === v || (v === "home" && view === "editor") ? "text-ink" : "text-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 max-w-[1160px] items-center justify-between px-5">
        <button onClick={() => setView("home")} className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[15px] font-semibold tracking-[0.18em]">FERRIX</span>
        </button>
        <nav className="flex items-center gap-6">
          {link("home", "Create")}
          {link("about", "About")}
        </nav>
      </div>
    </header>
  );
}

function Home({ onLoaded, onJson }: { onLoaded: (p: Post[]) => void; onJson: () => void }) {
  const [url, setUrl] = useState("");
  const [thread, setThread] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = detect(url);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return setError("Paste a link to a single post, like x.com/user/status/123.");
    if (!d.supported) return setError("Threads support is coming soon. X links work today.");
    setError(null);
    setBusy(true);
    try {
      const res = await post("/api/extract", { url: url.trim(), thread });
      if (!res.ok) return setError(await errorText(res));
      const data = (await res.json()) as { posts: Post[] };
      onLoaded(data.posts);
    } catch {
      setError("Couldn't reach Ferrix. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const chip = (label: string, on: boolean, soon = false) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
        on ? "border-ink bg-ink text-paper" : "border-line text-muted"
      }`}
    >
      {label}
      {soon && <span className="text-[10px] uppercase tracking-wider opacity-70">soon</span>}
    </span>
  );

  return (
    <main className="mx-auto flex max-w-[1160px] flex-col items-center px-5 pb-24 pt-20 sm:pt-28">
      <p className="mb-5 text-xs font-medium uppercase tracking-[0.22em] text-rust">Social post relay</p>
      <h1 className="text-center text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
        Information travels.
        <br />
        <span className="text-muted">Independently.</span>
      </h1>
      <p className="mt-5 max-w-md text-center text-[15px] leading-relaxed text-muted">
        Turn public posts into standalone images you can download and share anywhere.
      </p>

      <form onSubmit={submit} className="mt-10 w-full max-w-xl">
        <div className="flex items-center rounded-xl border border-line bg-surface p-1.5 shadow-[0_1px_0_rgba(0,0,0,0.03)] focus-within:border-ink/40">
          <input
            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-muted/70"
            placeholder="Paste an X post URL…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            inputMode="url"
            autoFocus
          />
          <button
            className="rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-rust disabled:opacity-40"
            disabled={busy || !url.trim()}
          >
            {busy ? "Fetching…" : "Create image →"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            {chip("X", d?.platform === "x")}
            {chip("Threads", d?.platform === "threads", true)}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <Switch checked={thread} onChange={setThread} />
            Include the author's thread
          </label>
        </div>
        {error && <p className="mt-3 px-1 text-sm text-rust">{error}</p>}
      </form>

      <div className="mt-16 flex items-center gap-4 text-xs text-muted">
        <span>No account required</span>
        <span className="h-3 w-px bg-line" />
        <button onClick={onJson} className="underline-offset-4 hover:text-ink hover:underline">
          Start from JSON
        </button>
      </div>
    </main>
  );
}

function About({ onStart }: { onStart: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-5 pb-24 pt-20">
      <p className="mb-4 text-xs font-medium uppercase tracking-[0.22em] text-rust">About</p>
      <h1 className="text-3xl font-semibold tracking-tight">The message outlives the messenger.</h1>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-muted">
        <p>
          Ferrix rebuilds a public post as a clean, standalone image: the words, the media and, if you want it, the
          attribution. You download it and post it wherever you like.
        </p>
        <p>
          No login, no connected accounts, nothing published for you. Ferrix only reads posts that are already public,
          and video or GIF posts are rendered as a still with their thumbnail.
        </p>
        <p>X is supported today. Threads is next.</p>
      </div>
      <button onClick={onStart} className="mt-8 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper hover:bg-rust">
        Create an image →
      </button>
    </main>
  );
}

function Editor({ posts, setPosts, onNew }: { posts: Post[]; setPosts: (p: Post[]) => void; onNew: () => void }) {
  const [theme, setTheme] = useState<ThemeId>("light");
  const [attribution, setAttribution] = useState<AttributionPreset>("original");
  const [showDate, setShowDate] = useState(true);
  const [showMetrics, setShowMetrics] = useState(false);
  const [logo, setLogo] = useState<Logo>("x");
  const [maskUsername, setMaskUsername] = useState(false);
  const [width, setWidth] = useState(600);
  const [scale, setScale] = useState(2);
  const [mode, setMode] = useState<ThreadMode>("combined");
  const [numbering, setNumbering] = useState(true);
  const [maxHeight, setMaxHeight] = useState(3200);
  const [selected, setSelected] = useState<boolean[]>(() => posts.map(() => true));
  const [focus, setFocus] = useState(0);
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");

  const [output, setOutput] = useState<Output | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState(() => JSON.stringify(posts.length === 1 ? posts[0] : posts, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    setSelected(posts.map(() => true));
    setFocus(0);
    setJson(JSON.stringify(posts.length === 1 ? posts[0] : posts, null, 2));
  }, [posts]);

  const isThread = posts.length > 1;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const options = useMemo(
    () => ({ theme, attribution, timeZone, showDate, showMetrics, logo, maskUsername, width, scale, maxHeight }),
    [theme, attribution, timeZone, showDate, showMetrics, logo, maskUsername, width, scale, maxHeight],
  );
  const select = selected.map((on, i) => (on ? i + 1 : 0)).filter(Boolean);
  const selectKey = select.join(",");

  useEffect(() => {
    if (isThread && !select.length) {
      setError("Select at least one post to export.");
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const res = isThread
          ? await post("/api/render/thread", { posts, mode, numbering, select, options })
          : await post("/api/render", { post: posts[0], options });
        if (!res.ok) throw new Error(await errorText(res));
        const isZip = res.headers.get("Content-Type")?.includes("zip") ?? false;
        const blobUrl = URL.createObjectURL(await res.blob());
        const out: Output = {
          kind: isZip ? "zip" : "png",
          url: blobUrl,
          name: fileName(res, isZip ? "ferrix_thread.zip" : "ferrix.png"),
          count: Number(res.headers.get("X-Ferrix-Count") ?? 1),
        };
        // A ZIP can't be previewed: show the focused card on its own instead.
        let pv: Preview = { url: blobUrl };
        if (isZip) {
          const f = select.includes(focus + 1) ? focus : select[0] - 1;
          const r = await post("/api/render", {
            post: posts[f],
            options,
            badge: numbering ? `${f + 1}/${posts.length}` : undefined,
          });
          if (!r.ok) throw new Error(await errorText(r));
          pv = {
            url: URL.createObjectURL(await r.blob()),
            caption:
              mode === "individual"
                ? `Post ${f + 1} of ${posts.length}. The export holds ${out.count} images.`
                : `Long thread split into ${out.count} images. Showing post ${f + 1}.`,
          };
        }
        if (id !== seq.current) return;
        setOutput((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return out;
        });
        setPreview((old) => {
          if (old && old.url !== pv.url) URL.revokeObjectURL(old.url);
          return pv;
        });
      } catch (e) {
        if (id === seq.current) setError((e as Error).message);
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, options, mode, numbering, selectKey, focus, isThread]);

  function applyJson() {
    try {
      const v = Input.parse(JSON.parse(json));
      setJsonError(null);
      setPosts(Array.isArray(v) ? v : [v]);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }

  const head = posts[0];
  const who = head.author.username ? `@${head.author.username}` : head.author.name ?? "post";

  return (
    <main className="mx-auto max-w-[1160px] px-5 pb-16 pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <button onClick={onNew} className="text-muted hover:text-ink">← New</button>
          <span className="h-3.5 w-px bg-line" />
          <span className="font-medium">{isThread ? `Thread · ${posts.length} posts` : "Single post"}</span>
          <span className="text-muted">X · {maskUsername ? "hidden" : who}</span>
        </div>
        {output && (
          <a
            href={output.url}
            download={output.name}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-rust lg:hidden"
          >
            Download {output.kind === "zip" ? `ZIP (${output.count})` : "PNG"}
          </a>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Canvas */}
        <section className="flex min-w-0 flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line bg-surface px-3 py-2 text-xs text-muted">
              <span>Preview</span>
              <div className="flex items-center gap-3">
                {dims && <span className="tabular-nums">{dims.w} × {dims.h}px</span>}
                <Segmented
                  small
                  value={zoom}
                  onChange={setZoom}
                  items={[
                    { id: "fit", label: "Fit" },
                    { id: "actual", label: "1:1" },
                  ]}
                />
              </div>
            </div>
            <div className={`canvas-dots relative flex min-h-[220px] justify-center p-4 sm:min-h-[420px] sm:p-10 ${zoom === "actual" ? "overflow-auto" : ""}`}>
              {preview ? (
                <img
                  src={preview.url}
                  alt="Rendered post"
                  onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                  className={`h-auto self-start rounded-lg shadow-[0_8px_30px_rgba(27,26,24,0.12)] transition-opacity ${busy ? "opacity-60" : ""} ${
                    zoom === "fit" ? "max-w-full" : "max-w-none"
                  }`}
                  style={zoom === "fit" ? { width: Math.min(width, 680) } : undefined}
                />
              ) : (
                <div className="self-center text-sm text-muted">{busy ? "Rendering…" : "Nothing to preview yet"}</div>
              )}
              {busy && preview && (
                <span className="absolute right-3 top-3 rounded-md bg-ink/80 px-2 py-1 text-[11px] text-paper">Rendering…</span>
              )}
            </div>
            {preview?.caption && <div className="border-t border-line bg-surface px-3 py-2 text-xs text-muted">{preview.caption}</div>}
          </div>
          {error && <p className="rounded-lg border border-rust/30 bg-rust/5 px-3 py-2 text-sm text-rust">{error}</p>}

          {isThread && (
            <div className="rounded-xl border border-line bg-surface">
              <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs text-muted">
                <span>
                  Posts in thread · {select.length} of {posts.length} selected
                </span>
                <div className="flex gap-3">
                  <button className="hover:text-ink" onClick={() => setSelected(posts.map(() => true))}>All</button>
                  <button className="hover:text-ink" onClick={() => setSelected(posts.map(() => false))}>None</button>
                </div>
              </div>
              <ol className="flex gap-2 overflow-x-auto p-3">
                {posts.map((p, i) => (
                  <li key={i} className="shrink-0">
                    <div
                      onClick={() => setFocus(i)}
                      className={`flex h-[104px] w-48 cursor-pointer flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
                        focus === i ? "border-ink bg-paper" : "border-line bg-paper/40 hover:border-ink/40"
                      } ${selected[i] ? "" : "opacity-45"}`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-muted">
                        <span className="tabular-nums">{i + 1}/{posts.length}</span>
                        <input
                          type="checkbox"
                          className="accent-[#a8502b]"
                          checked={selected[i] ?? true}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setSelected((s) => s.map((v, j) => (j === i ? e.target.checked : v)))}
                          aria-label={`Include post ${i + 1}`}
                        />
                      </div>
                      <p className="line-clamp-3 text-xs leading-snug">
                        {p.content.text.trim() || (p.content.media.length ? `${p.content.media.length} media` : "—")}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        {/* Controls */}
        <aside className="flex flex-col gap-3">
          <Section title="Appearance">
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex flex-col items-start gap-2 rounded-lg border p-2 text-left transition-colors ${
                    theme === t.id ? "border-ink" : "border-line hover:border-ink/40"
                  }`}
                >
                  <span className="flex h-8 w-full items-end rounded-md border border-black/5 p-1.5" style={{ background: t.swatch[0] }}>
                    <span className="h-1.5 w-8 rounded-full" style={{ background: t.swatch[1] }} />
                  </span>
                  <span className="text-xs font-medium">{t.name}</span>
                </button>
              ))}
            </div>
            <Row label="Card width">
              <Segmented value={width} onChange={setWidth} items={[480, 600, 800].map((w) => ({ id: w, label: String(w) }))} />
            </Row>
          </Section>

          <Section title="Attribution">
            <Segmented
              full
              value={attribution}
              onChange={setAttribution}
              items={[
                { id: "original", label: "Original" },
                { id: "minimal", label: "Minimal" },
                { id: "clean", label: "Clean" },
              ]}
            />
            <p className="text-xs leading-relaxed text-muted">
              {attribution === "original" && "Avatar, name, handle and time, like the source."}
              {attribution === "minimal" && "Name and handle only. No avatar or time."}
              {attribution === "clean" && "Just the content. No author identity."}
            </p>
            <Toggle label="Timestamp" checked={showDate} onChange={setShowDate} disabled={attribution !== "original"} />
            <Toggle label="Engagement metrics" checked={showMetrics} onChange={setShowMetrics} />
            <Toggle label="Censor @username" hint="da****wa" checked={maskUsername} onChange={setMaskUsername} disabled={attribution === "clean"} />
            <Row label="Platform mark">
              <Segmented
                value={logo}
                onChange={setLogo}
                items={[
                  { id: "x", label: "X" },
                  { id: "twitter", label: "Bird" },
                  { id: "none", label: "None" },
                ]}
              />
            </Row>
          </Section>

          {isThread && (
            <Section title="Thread layout">
              <Segmented
                full
                value={mode}
                onChange={setMode}
                items={[
                  { id: "combined", label: "Combined" },
                  { id: "individual", label: "Individual cards" },
                ]}
              />
              <Toggle label="Numbering" hint="3/10" checked={numbering} onChange={setNumbering} />
              {mode === "combined" && (
                <Row label="Split long images at">
                  <Segmented
                    value={maxHeight}
                    onChange={setMaxHeight}
                    items={[
                      { id: 2000, label: "2k" },
                      { id: 3200, label: "3.2k" },
                      { id: 8000, label: "Never" },
                    ]}
                  />
                </Row>
              )}
            </Section>
          )}

          <Section title="Export">
            <Row label="Format">
              <Segmented
                value="png"
                onChange={() => {}}
                items={[
                  { id: "png", label: "PNG" },
                  { id: "webp", label: "WebP", disabled: true },
                ]}
              />
            </Row>
            <Row label="Resolution">
              <Segmented value={scale} onChange={setScale} items={[1, 2, 3].map((s) => ({ id: s, label: `${s}×` }))} />
            </Row>
            <a
              href={output?.url}
              download={output?.name}
              aria-disabled={!output || busy}
              className={`mt-1 flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                output && !busy ? "bg-ink text-paper hover:bg-rust" : "pointer-events-none bg-line text-muted"
              }`}
            >
              {output?.kind === "zip" ? `Download ${output.count} images (ZIP)` : "Download image"}
            </a>
            {output && <p className="truncate text-center text-[11px] text-muted">{output.name}</p>}
          </Section>

          <Section title="Post data" defaultOpen={false}>
            <p className="text-xs text-muted">Edit the post as JSON: one object, or an array for a thread.</p>
            <textarea
              className="h-56 w-full rounded-lg border border-line bg-paper p-2.5 font-mono text-[11px] leading-relaxed outline-none focus:border-ink/40"
              value={json}
              onChange={(e) => setJson(e.target.value)}
              spellCheck={false}
            />
            {jsonError && <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-[11px] text-rust">{jsonError}</pre>}
            <button onClick={applyJson} className="rounded-lg border border-ink px-3 py-2 text-sm hover:bg-ink hover:text-paper">
              Apply JSON
            </button>
          </Section>
        </aside>
      </div>
    </main>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded-xl border border-line bg-surface">
      <summary className="flex items-center justify-between px-4 py-3 text-[13px] font-medium">
        {title}
        <span className="chev text-muted transition-transform">›</span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line px-4 py-3.5">{children}</div>
    </details>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-muted">{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center justify-between gap-3 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
      <span className="text-[13px]">
        {label}
        {hint && <span className="ml-2 font-mono text-[11px] text-muted">{hint}</span>}
      </span>
      <Switch checked={checked && !disabled} onChange={onChange} disabled={disabled} />
    </label>
  );
}

function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${checked ? "bg-rust" : "bg-line"}`}
    >
      <span
        className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-[left] ${checked ? "left-[16px]" : "left-[2px]"}`}
      />
    </button>
  );
}

function Segmented<T extends string | number>({
  value,
  onChange,
  items,
  full,
  small,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; disabled?: boolean }[];
  full?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`inline-flex rounded-lg border border-line bg-paper p-0.5 ${full ? "w-full" : ""}`}>
      {items.map((it) => (
        <button
          key={String(it.id)}
          type="button"
          disabled={it.disabled}
          title={it.disabled ? "Coming soon" : undefined}
          onClick={() => onChange(it.id)}
          className={`${full ? "flex-1" : ""} rounded-md ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"} transition-colors ${
            value === it.id ? "bg-ink text-paper" : it.disabled ? "text-muted/50" : "text-muted hover:text-ink"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
