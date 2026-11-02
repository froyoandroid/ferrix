import { useEffect, useState } from "react";
import { NormalizedPost, type AttributionPreset } from "@ferrix/shared";

const sample = {
  platform: "x",
  sourceUrl: "https://x.com/ferrix/status/1",
  author: { name: "Ferrix", username: "ferrix" },
  content: { text: "The message outlives the messenger.", media: [] },
  timestamp: "2026-11-02T18:30:00Z",
};

export default function App() {
  const [json, setJson] = useState(JSON.stringify(sample, null, 2));
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [attribution, setAttribution] = useState<AttributionPreset>("original");
  const [img, setImg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function render() {
    setError(null);
    let post;
    try {
      post = NormalizedPost.parse(JSON.parse(json));
    } catch (e) {
      return setError((e as Error).message);
    }
    const res = await fetch("/api/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post, options: { theme, attribution } }),
    });
    if (!res.ok) return setError(await res.text());
    const url = URL.createObjectURL(await res.blob());
    setImg((old) => (old && URL.revokeObjectURL(old), url));
  }

  useEffect(() => {
    render();
  }, [theme, attribution]);

  return (
    <main className="mx-auto max-w-5xl p-6 font-sans">
      <h1 className="text-2xl font-bold">Ferrix</h1>
      <p className="mb-6 text-sm text-neutral-500">The message outlives the messenger.</p>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-3">
          <textarea
            className="h-80 rounded border p-3 font-mono text-xs"
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
          <div className="flex gap-3 text-sm">
            <select className="rounded border p-1" value={theme} onChange={(e) => setTheme(e.target.value as "light" | "dark")}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <select className="rounded border p-1" value={attribution} onChange={(e) => setAttribution(e.target.value as AttributionPreset)}>
              <option value="original">Original</option>
              <option value="minimal">Minimal</option>
              <option value="clean">Clean</option>
            </select>
            <button className="rounded bg-black px-3 py-1 text-white" onClick={render}>Render</button>
          </div>
          {error && <pre className="whitespace-pre-wrap text-xs text-red-600">{error}</pre>}
        </section>
        <section className="flex flex-col gap-3">
          {img && (
            <>
              <img src={img} alt="Rendered post" className="rounded border" />
              <a className="text-sm underline" href={img} download="ferrix.png">Download PNG</a>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
