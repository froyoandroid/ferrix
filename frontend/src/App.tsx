import { useEffect, useState, useMemo } from "react";
import { NormalizedPost, type AttributionPreset, type ThreadMode } from "@ferrix/shared";
import { z } from "zod";

const sample = [
  {
    platform: "x",
    sourceUrl: "https://x.com/ferrix/status/1",
    author: { name: "Ferrix", username: "ferrix" },
    content: { text: "The message outlives the messenger. 🧵", media: [] },
    timestamp: "2026-11-02T18:30:00Z",
    metrics: { replies: 12, reposts: 48, likes: 1280, views: 20400 },
  },
  {
    platform: "x",
    sourceUrl: "https://x.com/ferrix/status/2",
    author: { name: "Ferrix", username: "ferrix" },
    content: { text: "Paste one post object, or an array of posts for a thread. #ferrix", media: [] },
    timestamp: "2026-11-02T18:31:00Z",
    metrics: { replies: 3, likes: 210 },
  },
];

const Input = z.union([NormalizedPost, z.array(NormalizedPost).min(1)]);
type Result =
  | { kind: "png"; url: string; name: string }
  | { kind: "zip"; url: string; name: string; count: string }
  | { kind: "mp4"; url: string; name: string };

/** Filename from the server's Content-Disposition, so downloads carry the post's identity. */
function fileName(res: Response, fallback: string) {
  return /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;
}

type Single = z.infer<typeof NormalizedPost>;
const hasMotion = (p: Single) =>
  [...p.content.media, ...(p.quote?.content.media ?? [])].some((m) => m.type !== "image" && m.videoUrl);

export default function App() {
  const [json, setJson] = useState(JSON.stringify(sample, null, 2));
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [attribution, setAttribution] = useState<AttributionPreset>("original");
  const [mode, setMode] = useState<ThreadMode>("combined");
  const [numbering, setNumbering] = useState(true);
  // Thread-only controls (mode, numbering) show only when the editor holds more than one post.
  const jsonIsThread = useMemo(() => {
    try {
      const v = JSON.parse(json);
      return Array.isArray(v) && v.length > 1;
    } catch {
      return false;
    }
  }, [json]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [asThread, setAsThread] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [single, setSingle] = useState<Single | null>(null);
  const [encoding, setEncoding] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [showDate, setShowDate] = useState(true);
  const [logo, setLogo] = useState<"x" | "twitter" | "none">("x");
  const [maskUsername, setMaskUsername] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const renderOptions = () => ({ theme, attribution, timeZone, showMetrics, showDate, logo, maskUsername });

  async function fetchPost(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setError(null);
    setFetching(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), thread: asThread }),
      });
      const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
      if (!res.ok) return setError(data.error ?? `Request failed (${res.status})`);
      const text = JSON.stringify(data.posts.length === 1 ? data.posts[0] : data.posts, null, 2);
      setJson(text);
      await render(text);
    } finally {
      setFetching(false);
    }
  }

  async function render(source = json) {
    setError(null);
    let input;
    try {
      input = Input.parse(JSON.parse(source));
    } catch (e) {
      return setError((e as Error).message);
    }
    const options = renderOptions();
    const isThread = Array.isArray(input) && input.length > 1;
    setSingle(isThread ? null : Array.isArray(input) ? input[0] : input);
    const body = isThread
      ? { posts: input, mode, numbering, options }
      : { post: Array.isArray(input) ? input[0] : input, options };
    setBusy(true);
    try {
      const res = await fetch(isThread ? "/api/render/thread" : "/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return setError(await res.text());
      const url = URL.createObjectURL(await res.blob());
      const isZip = res.headers.get("Content-Type")?.includes("zip");
      const name = fileName(res, isZip ? "ferrix-thread.zip" : "ferrix.png");
      setResult((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return isZip ? { kind: "zip", url, name, count: res.headers.get("X-Ferrix-Count") ?? "?" } : { kind: "png", url, name };
      });
    } finally {
      setBusy(false);
    }
  }

  async function renderVideo() {
    if (!single) return;
    setError(null);
    setEncoding(true);
    try {
      const res = await fetch("/api/render/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post: single, options: renderOptions() }),
      });
      if (!res.ok) return setError((await res.json().catch(() => null))?.error ?? `Video render failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const name = fileName(res, "ferrix.mp4");
      setResult((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { kind: "mp4", url, name };
      });
    } finally {
      setEncoding(false);
    }
  }

  useEffect(() => {
    render();
  }, [theme, attribution, mode, numbering, showMetrics, showDate, logo, maskUsername]);

  const sel = "rounded border border-neutral-300 bg-white p-1 dark:bg-neutral-900";
  return (
    <main className="mx-auto max-w-6xl p-6 font-sans">
      <h1 className="text-2xl font-bold">Ferrix</h1>
      <p className="mb-6 text-sm text-neutral-500">The message outlives the messenger.</p>
      <form onSubmit={fetchPost} className="mb-6 flex flex-wrap items-center gap-3">
        <input
          className="min-w-0 flex-1 rounded border border-neutral-300 p-2 text-sm"
          placeholder="Paste an X post URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
        />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={asThread} onChange={(e) => setAsThread(e.target.checked)} /> Include thread
        </label>
        <button className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50" disabled={fetching || !url.trim()}>
          {fetching ? "Fetching…" : "Fetch"}
        </button>
      </form>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-3">
          <textarea
            className="h-96 rounded border border-neutral-300 p-3 font-mono text-xs"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <select className={sel} value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark")}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <select className={sel} value={attribution} onChange={(e) => setAttribution(e.target.value as AttributionPreset)}>
              <option value="original">Original</option>
              <option value="minimal">Minimal</option>
              <option value="clean">Clean</option>
            </select>
            {jsonIsThread && (
              <select className={sel} value={mode} onChange={(e) => setMode(e.target.value as ThreadMode)}>
                <option value="combined">Thread: combined</option>
                <option value="individual">Thread: individual cards</option>
              </select>
            )}
            <select className={sel} value={logo} onChange={(e) => setLogo(e.target.value as "x" | "twitter" | "none")}>
              <option value="x">Logo: X</option>
              <option value="twitter">Logo: Twitter bird</option>
              <option value="none">Logo: none</option>
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showMetrics} onChange={(e) => setShowMetrics(e.target.checked)} /> Metrics
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} /> Date
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={maskUsername} onChange={(e) => setMaskUsername(e.target.checked)} /> Censor @username
            </label>
            {jsonIsThread && (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={numbering} onChange={(e) => setNumbering(e.target.checked)} /> Numbering
              </label>
            )}
            <button className="rounded bg-black px-3 py-1 text-white disabled:opacity-50" onClick={() => render()} disabled={busy}>
              {busy ? "Rendering…" : "Render"}
            </button>
            {single && hasMotion(single) && (
              <button className="rounded border border-black px-3 py-1 disabled:opacity-50" onClick={renderVideo} disabled={encoding}>
                {encoding ? "Encoding video…" : "Animated (MP4)"}
              </button>
            )}
          </div>
          {error && <pre className="whitespace-pre-wrap text-xs text-red-600">{error}</pre>}
        </section>
        <section className="flex flex-col gap-3">
          {result?.kind === "png" && (
            <>
              <img src={result.url} alt="Rendered post" className="rounded border border-neutral-200" />
              <a className="text-sm underline" href={result.url} download={result.name}>Download PNG</a>
            </>
          )}
          {result?.kind === "mp4" && (
            <>
              <video src={result.url} controls autoPlay loop muted playsInline className="rounded border border-neutral-200" />
              <a className="text-sm underline" href={result.url} download={result.name}>Download MP4</a>
            </>
          )}
          {result?.kind === "zip" && (
            <a className="rounded border border-neutral-300 p-4 text-sm underline" href={result.url} download={result.name}>
              Download {result.count} images (ZIP)
            </a>
          )}
        </section>
      </div>
    </main>
  );
}
