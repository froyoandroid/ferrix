import { useEffect, useMemo, useRef, useState } from "react";
import { RenderOptions, type NormalizedPost, type ThreadMode } from "@ferrix/shared";
import { Section, Row, Toggle, Segmented } from "./ui";
import {
  api,
  errorText,
  fileName,
  freshDraft,
  Input,
  move,
  PreviewCache,
  saveDraft,
  svgUrl,
  type Draft,
  type PreviewImage,
  type Settings,
  type ThemeId,
} from "./lib";

const THEMES: { id: ThemeId; name: string; swatch: [string, string] }[] = [
  { id: "light", name: "Paper", swatch: ["#ffffff", "#0f1419"] },
  { id: "dark", name: "Carbon", swatch: ["#000000", "#e7e9ea"] },
  { id: "ferrix", name: "Ferrix", swatch: ["#efe9df", "#a8502b"] },
];

const cache = new PreviewCache();

// The layout engine (Satori + fonts) loads on first use, so Home stays light.
const engineModule = () => import("./render/browser");

type PreviewReq = { path: string; focus?: number; body: Record<string, unknown> };
type ThreadExport = { posts: NormalizedPost[]; mode: ThreadMode; numbering: boolean; select: number[]; options: RenderOptions };

async function previewLocal(req: PreviewReq): Promise<string[]> {
  const { renderer } = await engineModule();
  const b = req.body as { post: NormalizedPost; posts: NormalizedPost[]; options: object; badge?: string; numbering: boolean; select: number[] };
  const options = RenderOptions.parse(b.options);
  if (req.path === "/api/preview/thread")
    return (await renderer.thread(b.posts, { mode: "combined", numbering: b.numbering, select: b.select, options })).map((i) => i.svg);
  return [(await renderer.card(b.post, options, b.badge)).svg];
}

async function previewServer(req: PreviewReq, signal: AbortSignal): Promise<string[]> {
  const res = await api(req.path, req.body, signal);
  if (!res.ok) throw new Error(await errorText(res));
  return req.path === "/api/preview/thread" ? ((await res.json()) as { segments: string[] }).segments : [await res.text()];
}

async function exportLocal(thread: ThreadExport | null, post: NormalizedPost, options: RenderOptions, format: "png" | "webp") {
  const { renderer, rasterize, canRasterize, zipImages, fileBase } = await engineModule();
  const svgs = thread ? await renderer.thread(thread.posts, thread) : [await renderer.card(post, options)];
  if (!svgs.every((i) => canRasterize(i.svg, options.scale))) throw new Error("Image is too large for this browser's canvas");
  const files = [];
  for (const img of svgs) files.push({ name: img.name.replace(/\.png$/, `.${format}`), data: await rasterize(img.svg, options.scale, format) });
  if (files.length === 1) return { blob: new Blob([new Uint8Array(files[0].data)], { type: `image/${format}` }), name: files[0].name };
  const zip = zipImages(files, (thread?.posts ?? [post]).map((p) => p.sourceUrl));
  return { blob: new Blob([new Uint8Array(zip)], { type: "application/zip" }), name: `${fileBase(thread!.posts[0], options.maskUsername)}_thread.zip` };
}

async function exportServer(thread: ThreadExport | null, post: NormalizedPost, options: RenderOptions) {
  const res = thread ? await api("/api/render/thread", thread) : await api("/api/render", { post, options });
  if (!res.ok) throw new Error(await errorText(res));
  const zip = res.headers.get("Content-Type")?.includes("zip");
  return { blob: await res.blob(), name: fileName(res, zip ? "ferrix_thread.zip" : "ferrix.png") };
}

/**
 * Pipeline: extraction happened once on Home (the post is now local data). Every edit here only
 * re-lays out the card on the server (~30 ms, returned as SVG that the browser draws). Rasterizing to
 * PNG, the expensive part, runs only when the user downloads.
 */
export function Editor({ initial, onNew }: { initial: Draft; onNew: () => void }) {
  const [draft, setDraft] = useState<Draft>(initial);
  const { posts, order, selected, settings: s } = draft;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));

  const [focus, setFocus] = useState(order[0] ?? 0); // index into posts
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");
  const [preview, setPreview] = useState<{ images: PreviewImage[]; caption?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [json, setJson] = useState(() => JSON.stringify(posts.length === 1 ? posts[0] : posts, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [engine, setEngine] = useState<"browser" | "server">("browser");
  const lastExport = useRef<{ key: string; url: string; name: string } | null>(null);

  // Persist the whole draft so a reload or a later visit picks up where the user left off.
  useEffect(() => {
    const t = setTimeout(() => saveDraft(draft), 300);
    return () => clearTimeout(t);
  }, [draft]);

  const isThread = posts.length > 1;
  const ordered = useMemo(() => order.map((i) => posts[i]), [order, posts]);
  // 1-based positions in the current order that are selected for output.
  const select = useMemo(() => order.map((i, k) => (selected[i] ? k + 1 : 0)).filter(Boolean), [order, selected]);
  const posOf = (i: number) => order.indexOf(i) + 1;

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const renderOptions = useMemo(
    () => ({
      theme: s.theme,
      attribution: s.attribution,
      timeZone,
      showDate: s.showDate,
      showMetrics: s.showMetrics,
      logo: s.logo,
      maskUsername: s.maskUsername,
      width: s.width,
      maxHeight: s.maxHeight,
    }),
    [s.theme, s.attribution, timeZone, s.showDate, s.showMetrics, s.logo, s.maskUsername, s.width, s.maxHeight],
  );

  // What the preview shows. Resolution (scale) is not part of it: it only affects the export.
  const previewReq = useMemo((): PreviewReq | null => {
    if (!isThread) return { path: "/api/preview", body: { post: posts[0], options: renderOptions } };
    if (!select.length) return null;
    if (s.mode === "combined")
      return { path: "/api/preview/thread", body: { posts: ordered, mode: "combined", numbering: s.numbering, select, options: renderOptions } };
    const f = selected[focus] ? focus : order.find((i) => selected[i])!;
    return {
      path: "/api/preview",
      focus: f,
      body: { post: posts[f], options: renderOptions, badge: s.numbering ? `${posOf(f)}/${posts.length}` : undefined },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isThread, posts, ordered, select, s.mode, s.numbering, renderOptions, focus, selected, order]);

  useEffect(() => {
    if (!previewReq) {
      setError("Select at least one post to export.");
      return;
    }
    const key = previewReq.path + JSON.stringify(previewReq.body);
    const caption = () => {
      if (!isThread || s.mode !== "individual") return undefined;
      return `Card ${posOf(previewReq.focus!)} of ${posts.length}. Export holds ${select.length} images.`;
    };
    const hit = cache.get(key);
    if (hit) {
      setError(null);
      setPreview({ images: hit, caption: caption() });
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const svgs = await previewLocal(previewReq).catch(async (e) => {
          console.warn("Browser render failed, using server", e);
          setEngine("server");
          return previewServer(previewReq, ctrl.signal);
        });
        if (cancelled) return;
        const images = svgs.map(svgUrl);
        cache.set(key, images);
        setPreview({ images, caption: caption() });
      } catch (e) {
        if (!cancelled && (e as Error).name !== "AbortError") setError((e as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 90);
    return () => {
      cancelled = true;
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewReq]);

  async function download() {
    if (isThread && !select.length) return;
    const options = RenderOptions.parse({ ...renderOptions, scale: s.scale });
    const thread = isThread ? { posts: ordered, mode: s.mode, numbering: s.numbering, select, options } : null;
    const key = JSON.stringify([thread ?? posts[0], options, s.format]);
    let out = lastExport.current?.key === key ? lastExport.current : null;
    if (!out) {
      setExporting(true);
      setError(null);
      try {
        let blob: Blob;
        let name: string;
        try {
          ({ blob, name } = await exportLocal(thread, posts[0], options, s.format));
        } catch (e) {
          if (s.format !== "png") throw e;
          console.warn("Browser export failed, using server", e);
          ({ blob, name } = await exportServer(thread, posts[0], options));
        }
        out = { key, url: URL.createObjectURL(blob), name };
        if (lastExport.current) URL.revokeObjectURL(lastExport.current.url);
        lastExport.current = out;
      } catch (e) {
        setError((e as Error).message);
        return;
      } finally {
        setExporting(false);
      }
    }
    const a = document.createElement("a");
    a.href = out.url;
    a.download = out.name;
    a.click();
  }

  function applyJson() {
    try {
      const v = Input.parse(JSON.parse(json));
      setJsonError(null);
      setDraft((d) => freshDraft(Array.isArray(v) ? v : [v], d.settings));
      setFocus(0);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }

  const reorder = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    setDraft((d) => ({ ...d, order: move(d.order, from, to) }));
  };
  const reordered = order.some((v, i) => v !== i);

  // Export size estimate for the label.
  const combinedCount = isThread && s.mode === "combined" ? preview?.images.length ?? 1 : 1;
  const exportCount = !isThread ? 1 : s.mode === "individual" ? select.length : combinedCount;
  const first = preview?.images[0];
  const head = posts[0];
  const who = head.author.username ? `@${head.author.username}` : head.author.name ?? "post";
  const displayWidth = (w: number) => (zoom === "fit" ? Math.min(w, 680) : (w * s.scale) / (window.devicePixelRatio || 1));

  return (
    <main className="mx-auto max-w-[1160px] px-5 pb-16 pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          <button onClick={onNew} className="text-muted hover:text-ink">← New</button>
          <span className="h-3.5 w-px bg-line" />
          <span className="font-medium">{isThread ? `Thread · ${posts.length} posts` : "Single post"}</span>
          <span className="text-muted">X · {s.maskUsername ? "hidden" : who}</span>
        </div>
        <button
          onClick={download}
          disabled={exporting}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-rust disabled:opacity-50 lg:hidden"
        >
          {exporting ? "Preparing…" : "Download"}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="flex items-center justify-between border-b border-line bg-surface px-3 py-2 text-xs text-muted">
              <span>
                Preview
                <span className="ml-2 text-muted/70" title={engine === "browser" ? "Rendered on this device" : "Rendered on the server"}>
                  · {engine === "browser" ? "on device" : "server"}
                </span>
              </span>
              <div className="flex items-center gap-3">
                {first && (
                  <span className="tabular-nums">
                    {Math.round(first.w * s.scale)} × {Math.round(first.h * s.scale)}px
                    {preview!.images.length > 1 && ` · ${preview!.images.length} images`}
                  </span>
                )}
                <Segmented small value={zoom} onChange={setZoom} items={[{ id: "fit", label: "Fit" }, { id: "actual", label: "1:1" }]} />
              </div>
            </div>
            <div className={`canvas-dots relative flex min-h-[220px] flex-col items-center gap-4 p-4 sm:min-h-[420px] sm:p-10 ${zoom === "actual" ? "overflow-auto" : ""}`}>
              {preview ? (
                preview.images.map((img, i) => (
                  <div key={img.url} className="flex flex-col items-center gap-1.5">
                    {preview.images.length > 1 && <span className="text-[11px] text-muted">Image {i + 1} of {preview.images.length}</span>}
                    <img
                      src={img.url}
                      alt={`Rendered post${preview.images.length > 1 ? ` part ${i + 1}` : ""}`}
                      className={`h-auto rounded-lg shadow-[0_8px_30px_rgba(27,26,24,0.12)] transition-opacity ${busy ? "opacity-70" : ""} ${zoom === "fit" ? "max-w-full" : "max-w-none"}`}
                      style={{ width: displayWidth(img.w) }}
                    />
                  </div>
                ))
              ) : (
                <div className="self-center pt-20 text-sm text-muted">{busy ? "Rendering…" : "Nothing to preview yet"}</div>
              )}
              {busy && preview && <span className="absolute right-3 top-3 rounded-md bg-ink/80 px-2 py-1 text-[11px] text-paper">Updating…</span>}
            </div>
            {preview?.caption && <div className="border-t border-line bg-surface px-3 py-2 text-xs text-muted">{preview.caption}</div>}
          </div>
          {error && <p className="rounded-lg border border-rust/30 bg-rust/5 px-3 py-2 text-sm text-rust">{error}</p>}

          {isThread && (
            <div className="rounded-xl border border-line bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2 text-xs text-muted">
                <span>
                  Thread order · {select.length} of {posts.length} selected · drag to reorder
                </span>
                <div className="flex gap-3">
                  {reordered && (
                    <button className="text-rust hover:text-rust-dark" onClick={() => setDraft((d) => ({ ...d, order: d.posts.map((_, i) => i) }))}>
                      Reset order
                    </button>
                  )}
                  <button className="hover:text-ink" onClick={() => setDraft((d) => ({ ...d, selected: d.posts.map(() => true) }))}>All</button>
                  <button className="hover:text-ink" onClick={() => setDraft((d) => ({ ...d, selected: d.posts.map(() => false) }))}>None</button>
                </div>
              </div>
              <ol className="flex gap-2 overflow-x-auto p-3">
                {order.map((i, k) => {
                  const p = posts[i];
                  return (
                    <li
                      key={i}
                      draggable
                      onDragStart={(e) => {
                        setDrag(k);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (drag !== null) reorder(drag, k);
                        setDrag(null);
                      }}
                      onDragEnd={() => setDrag(null)}
                      className={`shrink-0 ${drag === k ? "opacity-40" : ""}`}
                    >
                      <div
                        onClick={() => setFocus(i)}
                        className={`flex h-[116px] w-48 cursor-grab flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors active:cursor-grabbing ${
                          focus === i && s.mode === "individual" ? "border-ink bg-paper" : "border-line bg-paper/40 hover:border-ink/40"
                        } ${selected[i] ? "" : "opacity-45"}`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-muted">
                          <span className="tabular-nums">
                            {k + 1}/{posts.length}
                            {i !== k && <span className="ml-1 text-rust">was {i + 1}</span>}
                          </span>
                          <input
                            type="checkbox"
                            className="accent-[#a8502b]"
                            checked={selected[i] ?? true}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setDraft((d) => ({ ...d, selected: d.selected.map((v, j) => (j === i ? e.target.checked : v)) }))}
                            aria-label={`Include post ${k + 1}`}
                          />
                        </div>
                        <p className="line-clamp-3 flex-1 text-xs leading-snug">
                          {p.content.text.trim() || (p.content.media.length ? `${p.content.media.length} media` : "—")}
                        </p>
                        <div className="flex justify-between text-[13px] leading-none text-muted">
                          <button aria-label="Move earlier" disabled={k === 0} className="px-1 hover:text-ink disabled:opacity-25" onClick={(e) => { e.stopPropagation(); reorder(k, k - 1); }}>‹</button>
                          <button aria-label="Move later" disabled={k === order.length - 1} className="px-1 hover:text-ink disabled:opacity-25" onClick={(e) => { e.stopPropagation(); reorder(k, k + 1); }}>›</button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-3">
          <Section title="Appearance">
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => set("theme", t.id)}
                  className={`flex flex-col items-start gap-2 rounded-lg border p-2 text-left transition-colors ${s.theme === t.id ? "border-ink" : "border-line hover:border-ink/40"}`}
                >
                  <span className="flex h-8 w-full items-end rounded-md border border-black/5 p-1.5" style={{ background: t.swatch[0] }}>
                    <span className="h-1.5 w-8 rounded-full" style={{ background: t.swatch[1] }} />
                  </span>
                  <span className="text-xs font-medium">{t.name}</span>
                </button>
              ))}
            </div>
            <Row label="Card width">
              <Segmented value={s.width} onChange={(v) => set("width", v)} items={[480, 600, 800].map((w) => ({ id: w, label: String(w) }))} />
            </Row>
          </Section>

          <Section title="Attribution">
            <Segmented
              full
              value={s.attribution}
              onChange={(v) => set("attribution", v)}
              items={[{ id: "original", label: "Original" }, { id: "minimal", label: "Minimal" }, { id: "clean", label: "Clean" }]}
            />
            <p className="text-xs leading-relaxed text-muted">
              {s.attribution === "original" && "Avatar, name, handle and time, like the source."}
              {s.attribution === "minimal" && "Name and handle only. No avatar or time."}
              {s.attribution === "clean" && "Just the content. No author identity."}
            </p>
            <Toggle label="Timestamp" checked={s.showDate} onChange={(v) => set("showDate", v)} disabled={s.attribution !== "original"} />
            <Toggle label="Engagement metrics" checked={s.showMetrics} onChange={(v) => set("showMetrics", v)} />
            <Toggle label="Censor @username" hint="da****wa" checked={s.maskUsername} onChange={(v) => set("maskUsername", v)} disabled={s.attribution === "clean"} />
            <Row label="Platform mark">
              <Segmented value={s.logo} onChange={(v) => set("logo", v)} items={[{ id: "x", label: "X" }, { id: "twitter", label: "Bird" }, { id: "none", label: "None" }]} />
            </Row>
          </Section>

          {isThread && (
            <Section title="Thread layout">
              <Segmented full value={s.mode} onChange={(v) => set("mode", v)} items={[{ id: "combined", label: "Combined" }, { id: "individual", label: "Individual cards" }]} />
              <Toggle label="Numbering" hint="3/10" checked={s.numbering} onChange={(v) => set("numbering", v)} />
              {s.mode === "combined" && (
                <Row label="Split long images at">
                  <Segmented value={s.maxHeight} onChange={(v) => set("maxHeight", v)} items={[{ id: 2000, label: "2k" }, { id: 3200, label: "3.2k" }, { id: 8000, label: "Never" }]} />
                </Row>
              )}
            </Section>
          )}

          <Section title="Export">
            <Row label="Format">
              <Segmented value={s.format} onChange={(v) => set("format", v)} items={[{ id: "png", label: "PNG" }, { id: "webp", label: "WebP" }]} />
            </Row>
            <Row label="Resolution">
              <Segmented value={s.scale} onChange={(v) => set("scale", v)} items={[1, 2, 3].map((x) => ({ id: x, label: `${x}×` }))} />
            </Row>
            <button
              onClick={download}
              disabled={exporting || (isThread && !select.length)}
              className="mt-1 flex items-center justify-center rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-rust disabled:bg-line disabled:text-muted"
            >
              {exporting ? "Preparing…" : exportCount > 1 ? `Download ${exportCount} images (ZIP)` : "Download image"}
            </button>
          </Section>

          <Section title="Post data" defaultOpen={false}>
            <p className="text-xs text-muted">Edit the post as JSON: one object, or an array for a thread. Applying resets order and selection.</p>
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
