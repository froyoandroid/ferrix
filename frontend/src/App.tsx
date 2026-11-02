import { useEffect, useState } from "react";
import { NormalizedPost, type AttributionPreset, type ThreadMode } from "@ferrix/shared";
import { z } from "zod";

const sample = [
  {
    platform: "x",
    sourceUrl: "https://x.com/ferrix/status/1",
    author: { name: "Ferrix", username: "ferrix" },
    content: { text: "The message outlives the messenger. 🧵", media: [] },
    timestamp: "2026-11-02T18:30:00Z",
  },
  {
    platform: "x",
    sourceUrl: "https://x.com/ferrix/status/2",
    author: { name: "Ferrix", username: "ferrix" },
    content: { text: "Paste one post object, or an array of posts for a thread. #ferrix", media: [] },
    timestamp: "2026-11-02T18:31:00Z",
  },
];

const Input = z.union([NormalizedPost, z.array(NormalizedPost).min(1)]);
type Result = { kind: "png"; url: string } | { kind: "zip"; url: string; count: string };

export default function App() {
  const [json, setJson] = useState(JSON.stringify(sample, null, 2));
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [attribution, setAttribution] = useState<AttributionPreset>("original");
  const [mode, setMode] = useState<ThreadMode>("combined");
  const [numbering, setNumbering] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function render() {
    setError(null);
    let input;
    try {
      input = Input.parse(JSON.parse(json));
    } catch (e) {
      return setError((e as Error).message);
    }
    const options = { theme, attribution, timeZone };
    const isThread = Array.isArray(input) && input.length > 1;
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
      setResult((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return res.headers.get("Content-Type")?.includes("zip")
          ? { kind: "zip", url, count: res.headers.get("X-Ferrix-Count") ?? "?" }
          : { kind: "png", url };
      });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    render();
  }, [theme, attribution, mode, numbering]);

  const sel = "rounded border border-neutral-300 bg-white p-1 dark:bg-neutral-900";
  return (
    <main className="mx-auto max-w-6xl p-6 font-sans">
      <h1 className="text-2xl font-bold">Ferrix</h1>
      <p className="mb-6 text-sm text-neutral-500">The message outlives the messenger.</p>
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
            <select className={sel} value={mode} onChange={(e) => setMode(e.target.value as ThreadMode)}>
              <option value="combined">Thread: combined</option>
              <option value="individual">Thread: individual cards</option>
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={numbering} onChange={(e) => setNumbering(e.target.checked)} /> Numbering
            </label>
            <button className="rounded bg-black px-3 py-1 text-white disabled:opacity-50" onClick={render} disabled={busy}>
              {busy ? "Rendering…" : "Render"}
            </button>
          </div>
          {error && <pre className="whitespace-pre-wrap text-xs text-red-600">{error}</pre>}
        </section>
        <section className="flex flex-col gap-3">
          {result?.kind === "png" && (
            <>
              <img src={result.url} alt="Rendered post" className="rounded border border-neutral-200" />
              <a className="text-sm underline" href={result.url} download="ferrix.png">Download PNG</a>
            </>
          )}
          {result?.kind === "zip" && (
            <a className="rounded border border-neutral-300 p-4 text-sm underline" href={result.url} download="ferrix-thread.zip">
              Download {result.count} images (ZIP)
            </a>
          )}
        </section>
      </div>
    </main>
  );
}
