import { useState } from "react";
import { Editor } from "./Editor";
import { Switch } from "./ui";
import { api, errorText, freshDraft, loadDraft, type Draft, type Post } from "./lib";

type View = "home" | "editor" | "about";

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

function draftLabel(d: Draft) {
  const a = d.posts[0].author;
  const who = d.settings.maskUsername ? "hidden" : a.username ? `@${a.username}` : a.name ?? "post";
  return d.posts.length > 1 ? `${who} thread (${d.posts.length})` : who;
}

export default function App() {
  const [view, setView] = useState<View>("home");
  // A session is one editor lifetime; a new extraction or "continue" starts a new one.
  const [session, setSession] = useState<{ id: number; draft: Draft } | null>(null);
  const [saved, setSaved] = useState<Draft | null>(() => loadDraft());
  const open = (draft: Draft) => {
    setSession({ id: Date.now(), draft });
    setView("editor");
  };
  const goHome = () => {
    setSaved(loadDraft());
    setView("home");
  };

  return (
    <div className="min-h-screen font-sans">
      <Header view={view} setView={(v) => (v === "home" ? goHome() : setView(v))} />
      {view === "home" && (
        <Home
          onLoaded={(p) => open(freshDraft(p, saved?.settings, true))}
          onJson={() => open(freshDraft(sample, saved?.settings))}
          draft={saved}
          onContinue={() => saved && open(saved)}
        />
      )}
      {view === "editor" && session && <Editor key={session.id} initial={session.draft} onNew={goHome} />}
      {view === "about" && <About onStart={goHome} />}
    </div>
  );
}

type Detected = { platform: "x" | "threads"; supported: boolean } | null;
function detect(url: string): Detected {
  const u = url.trim();
  if (/^(https?:\/\/)?(www\.|mobile\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/i.test(u)) return { platform: "x", supported: true };
  if (/^(https?:\/\/)?(www\.)?threads\.(net|com)\/@[^/]+\/post\/[A-Za-z0-9_-]+/i.test(u)) return { platform: "threads", supported: true };
  return null;
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

function Home({ onLoaded, onJson, draft, onContinue }: { onLoaded: (p: Post[]) => void; onJson: () => void; draft: Draft | null; onContinue: () => void }) {
  const [url, setUrl] = useState("");
  const [thread, setThread] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const d = detect(url);
  const threadsLink = d?.platform === "threads";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d) return setError("Paste a link to a single post, like x.com/user/status/123 or threads.com/@user/post/abc.");
    setError(null);
    setBusy(true);
    try {
      const res = await api("/api/extract", { url: url.trim(), thread: thread && d.platform === "x" });
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
            placeholder="Paste an X or Threads post URL…"
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
            {chip("Threads", d?.platform === "threads")}
          </div>
          <label className={`flex items-center gap-2 text-xs text-muted ${threadsLink ? "opacity-50" : "cursor-pointer"}`}>
            <Switch checked={thread && !threadsLink} onChange={setThread} disabled={threadsLink} />
            Include the author's thread
          </label>
        </div>
        <p className="mt-1.5 px-1 text-right text-[11px] leading-relaxed text-muted/80">
          {threadsLink
            ? "Threads links import a single post for now."
            : thread
              ? "Ferrix follows the author's own replies up from this post (up to 25) and imports them in order."
              : "Turn on to import the whole self-thread this post belongs to."}
        </p>
        {error && <p className="mt-3 px-1 text-sm text-rust">{error}</p>}
      </form>

      {draft && (
        <button
          onClick={onContinue}
          className="mt-8 flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-left text-sm hover:border-ink/40"
        >
          <span className="h-2 w-2 rounded-full bg-rust" />
          <span>
            Continue your draft
            <span className="ml-2 text-muted">
              {draftLabel(draft)} · {new Date(draft.savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </span>
          <span className="text-muted">→</span>
        </button>
      )}

      <div className="mt-16 flex flex-col items-center gap-3 text-xs text-muted">
        <div className="flex items-center gap-4">
          <span>No account required</span>
          <span className="h-3 w-px bg-line" />
          <button onClick={() => setAdvanced((v) => !v)} className="underline-offset-4 hover:text-ink hover:underline" aria-expanded={advanced}>
            Advanced
          </button>
        </div>
        {advanced && (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
            <span>Developer options:</span>
            <button onClick={onJson} className="text-ink underline-offset-4 hover:underline">
              Start from post JSON
            </button>
          </div>
        )}
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

