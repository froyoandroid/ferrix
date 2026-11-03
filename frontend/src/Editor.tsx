import { useEffect, useMemo, useRef, useState } from "react";
import { RenderOptions, type NormalizedPost, type ThreadMode } from "@ferrix/shared";
import { Section, Row, Toggle, Segmented } from "./ui";
import { MediaPanel } from "./Media";
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

/** Rasterized files for a request, in export order. */
async function renderFiles(thread: ThreadExport | null, post: NormalizedPost, options: RenderOptions, format: "png" | "webp") {
  const { renderer, rasterize, canRasterize } = await engineModule();
  const svgs = thread ? await renderer.thread(thread.posts, thread) : [await renderer.card(post, options)];
  if (!svgs.every((i) => canRasterize(i.svg, options.scale))) throw new Error("Image is too large for this browser's canvas");
  const files: { name: string; data: Uint8Array }[] = [];
  for (const img of svgs) files.push({ name: img.name.replace(/\.png$/, `.${format}`), data: await rasterize(img.svg, options.scale, format) });
  return files;
}

async function exportLocal(thread: ThreadExport | null, post: NormalizedPost, options: RenderOptions, format: "png" | "webp") {
  const { zipImages, fileBase, threadRoot } = await engineModule();
  const files = await renderFiles(thread, post, options, format);
  const parts = files.map((f) => ({ name: f.name, blob: new Blob([new Uint8Array(f.data)], { type: `image/${format}` }) }));
  if (parts.length === 1) return { ...parts[0], parts };
  const zip = zipImages(files, (thread?.posts ?? [post]).map((p) => p.sourceUrl));
  return { blob: new Blob([new Uint8Array(zip)], { type: "application/zip" }), name: `${fileBase(threadRoot(thread!.posts), options.maskUsername)}_thread.zip`, parts };
}

/** X takes at most 4 images per post. */
const X_MAX_IMAGES = 4;
const intentUrl = (text: string) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

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
  const [sharing, setSharing] = useState(false);
  const lastShare = useRef<{ key: string; files: ReturnType<typeof renderFiles> } | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  /** Desktop paste flow: which images exist, which one is on the clipboard, whether copying failed. */
  const [paste, setPaste] = useState<{ count: number; copied: number | null; failed: boolean } | null>(null);
  const [caption, setCaption] = useState(() => (initial.settings.attribution === "clean" ? "" : `Source: ${initial.posts[0].sourceUrl}`));
  const lastExport = useRef<{ key: string; url: string; name: string } | null>(null);
  const [parts, setParts] = useState<{ name: string; url: string; size: number }[]>([]);

  // Persist the whole draft so a reload or a later visit picks up where the user left off.
  useEffect(() => {
    const t = setTimeout(() => saveDraft(draft), 300);
    return () => clearTimeout(t);
  }, [draft]);

  const isThread = posts.length > 1;
  const mediaIdx = isThread ? focus : 0;
  const mediaPost = posts[mediaIdx] ?? posts[0];
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
      mediaAspect: s.mediaAspect,
      altText: s.altText,
      postsPerImage: s.postsPerImage,
    }),
    [s.theme, s.attribution, timeZone, s.showDate, s.showMetrics, s.logo, s.maskUsername, s.width, s.maxHeight, s.mediaAspect, s.altText, s.postsPerImage],
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

  // Per-file links belong to one export; drop them once the output would differ.
  useEffect(() => {
    setParts((old) => {
      old.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
  }, [renderOptions, s.scale, s.format, s.mode, s.numbering, select, ordered]);
  useEffect(() => setPaste(null), [renderOptions, s.scale, s.mode, s.numbering, select, ordered]);

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
          const local = await exportLocal(thread, posts[0], options, s.format);
          ({ blob, name } = local);
          parts.forEach((p) => URL.revokeObjectURL(p.url));
          setParts(local.parts.length > 1 ? local.parts.map((p) => ({ name: p.name, url: URL.createObjectURL(p.blob), size: p.blob.size })) : []);
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

  /**
   * Share to X without any X login: the user posts it themselves.
   * - Devices with the Web Share API for files (most phones): hand the images and caption to the
   *   share sheet, where the user picks X.
   * - Elsewhere: copy the image to the clipboard and open X's composer with the caption prefilled;
   *   the user pastes the image (Ctrl/Cmd+V). Both the clipboard write and the window open happen
   *   inside the click, before any await, so browsers allow them.
   */
  function shareToX() {
    if (isThread && !select.length) return;
    setShareNote(null);
    setError(null);
    const options = RenderOptions.parse({ ...renderOptions, scale: s.scale });
    const thread = isThread ? { posts: ordered, mode: s.mode, numbering: s.numbering, select, options } : null;
    const key = JSON.stringify([thread ?? posts[0], options]);
    const files =
      lastShare.current?.key === key ? lastShare.current.files : renderFiles(thread, posts[0], options, "png");
    lastShare.current = { key, files };
    files.catch(() => (lastShare.current = null));
    const asFiles = files.then((fs) => fs.slice(0, X_MAX_IMAGES).map((f) => new File([new Uint8Array(f.data)], f.name, { type: "image/png" })));
    const probe = new File([new Uint8Array(8)], "probe.png", { type: "image/png" });
    const canShareFiles = typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
    setSharing(true);

    if (canShareFiles) {
      asFiles
        .then(async (fs) => {
          // Rendering can outlast the tap's activation on some browsers (NotAllowedError); a second tap then shares at once.
          await navigator.share({ files: fs, text: caption || undefined });
          if ((await files).length > X_MAX_IMAGES) setShareNote(`X takes 4 images per post. Shared the first 4; download the ZIP for the rest.`);
        })
        .catch((e) => {
          if ((e as Error).name === "AbortError") return;
          if ((e as Error).name === "NotAllowedError") setShareNote("Images are ready. Tap Share to X again to open the share sheet.");
          else setError((e as Error).message);
        })
        .finally(() => setSharing(false));
      return;
    }

    copyImage(0);
    files
      .then((fs) => setPaste((p) => ({ count: Math.min(fs.length, X_MAX_IMAGES), copied: p?.copied ?? null, failed: p?.failed ?? false })))
      .catch((e) => setError((e as Error).message))
      .finally(() => setSharing(false));
  }

  /** Put image i of the current share on the clipboard. The ClipboardItem takes a promise, so the write starts inside the click. */
  function copyImage(i: number) {
    const files = lastShare.current?.files;
    if (!files) return;
    const blob = files.then((fs) => new Blob([new Uint8Array(fs[i].data)], { type: "image/png" }));
    const write =
      typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
        ? navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(() => true, () => false)
        : Promise.resolve(false);
    write.then((ok) => setPaste((p) => ({ count: p?.count ?? 1, copied: ok ? i : (p?.copied ?? null), failed: !ok })));
  }

  function openX() {
    // No "noopener" feature string: with it, window.open returns null and we could not tell a blocked pop-up.
    const win = window.open(intentUrl(caption), "_blank");
    if (win) win.opener = null;
    else setShareNote("Your browser blocked the pop-up. Allow pop-ups for Ferrix, then click Open X again.");
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
          <span className="text-muted">{PLATFORM_NAME[head.platform]} · {s.maskUsername ? "hidden" : who}</span>
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
                  <span className="tabular-nums" title="Card width in CSS pixels, and the pixel size of the exported file">
                    {Math.round(first.w)} CSS px · {Math.round(first.w * s.scale)} × {Math.round(first.h * s.scale)} export px ({s.scale}×)
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

          <SourceInfo posts={ordered} extractedAt={draft.extractedAt} />

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
                          focus === i ? "border-ink bg-paper" : "border-line bg-paper/40 hover:border-ink/40"
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
          <div className="flex flex-col gap-3 rounded-xl border border-ink/25 bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium">Share to X</span>
              <span className="text-[11px] text-muted">{exportCount > 1 ? `${exportCount} images` : "1 image"}</span>
            </div>
            <textarea
              className="h-24 w-full resize-none rounded-lg border border-line bg-paper p-2.5 text-[13px] leading-snug outline-none focus:border-ink/40"
              value={caption}
              maxLength={280}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (optional)"
            />
            <div className="flex justify-between text-[11px] text-muted">
              <button className="hover:text-ink" onClick={() => setCaption(`Source: ${posts[0].sourceUrl}`)}>Add source link</button>
              <span className="tabular-nums">{caption.length}/280</span>
            </div>
            <button
              onClick={shareToX}
              disabled={sharing || (isThread && !select.length)}
              className="flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-3 text-[15px] font-medium text-paper transition-colors hover:bg-rust disabled:bg-line disabled:text-muted"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              {sharing ? "Preparing…" : "Share to X"}
            </button>
            {paste && <PasteSteps paste={paste} onCopy={copyImage} onOpen={openX} onDownload={download} />}
            {shareNote && <p className="rounded-lg bg-canvas px-3 py-2 text-xs leading-relaxed">{shareNote}</p>}
            <button
              onClick={download}
              disabled={exporting || (isThread && !select.length)}
              className="flex items-center justify-center rounded-lg border border-line px-4 py-2 text-[13px] font-medium transition-colors hover:border-ink/40 disabled:text-muted"
            >
              {exporting ? "Preparing…" : exportCount > 1 ? `Download ${exportCount} images (ZIP)` : "Download image"}
            </button>
            {parts.length > 1 && (
              <div className="flex flex-col gap-1 rounded-lg border border-line bg-paper p-2">
                <span className="px-1 text-[11px] text-muted">Or save them one by one</span>
                {parts.map((p, i) => (
                  <a key={p.url} href={p.url} download={p.name} className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-canvas">
                    <span className="truncate">
                      {i + 1}. {p.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">{Math.max(1, Math.round(p.size / 1024))} KB ↓</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <p className="px-1 pt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Customize card</p>
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

          <Section title="Attribution" defaultOpen={false}>
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
              <Segmented
                value={head.platform === "threads" && s.logo === "twitter" ? "x" : s.logo}
                onChange={(v) => set("logo", v)}
                items={
                  head.platform === "threads"
                    ? [{ id: "x", label: "Threads" }, { id: "none", label: "None" }]
                    : [{ id: "x", label: "X" }, { id: "twitter", label: "Bird" }, { id: "none", label: "None" }]
                }
              />
            </Row>
          </Section>

          {(mediaPost.content.media.length > 0 || (mediaPost.quote?.content.media.length ?? 0) > 0) && (
            <Section title="Media" defaultOpen={false}>
              <MediaPanel
                media={mediaPost.content.media}
                label={isThread ? `Media of post ${posOf(mediaIdx)} of ${posts.length}. Pick another card in the thread strip to edit its media.` : undefined}
                aspect={s.mediaAspect}
                altMode={s.altText}
                onAspect={(v) => set("mediaAspect", v)}
                onAltMode={(v) => set("altText", v)}
                onChange={(media) =>
                  setDraft((d) => ({ ...d, posts: d.posts.map((p, i) => (i === mediaIdx ? { ...p, content: { ...p.content, media } } : p)) }))
                }
              />
              {mediaPost.quote && mediaPost.quote.content.media.length > 0 && (
                <>
                  <p className="pt-1 text-[11px] font-medium text-ink">Quoted post</p>
                  <MediaPanel
                    compact
                    media={mediaPost.quote.content.media}
                    aspect={s.mediaAspect}
                    altMode={s.altText}
                    onAspect={(v) => set("mediaAspect", v)}
                    onAltMode={(v) => set("altText", v)}
                    onChange={(media) =>
                      setDraft((d) => ({
                        ...d,
                        posts: d.posts.map((p, i) => (i === mediaIdx && p.quote ? { ...p, quote: { ...p.quote, content: { ...p.quote.content, media } } } : p)),
                      }))
                    }
                  />
                </>
              )}
            </Section>
          )}

          {isThread && (
            <Section title="Thread layout">
              <Segmented full value={s.mode} onChange={(v) => set("mode", v)} items={[{ id: "combined", label: "Combined" }, { id: "individual", label: "Individual cards" }]} />
              <Toggle label="Numbering" hint="3/10" checked={s.numbering} onChange={(v) => set("numbering", v)} />
              {s.mode === "combined" && (
                <Row label="Split long images at">
                  <Segmented value={s.maxHeight} onChange={(v) => set("maxHeight", v)} items={[{ id: 2000, label: "2k" }, { id: 3200, label: "3.2k" }, { id: 8000, label: "Never" }]} />
                </Row>
              )}
              {s.mode === "combined" && (
                <Row label="Posts per image">
                  <Segmented value={s.postsPerImage} onChange={(v) => set("postsPerImage", v)} items={[{ id: 0, label: "Auto" }, { id: 3, label: "3" }, { id: 5, label: "5" }, { id: 8, label: "8" }]} />
                </Row>
              )}
            </Section>
          )}

          <Section title="Download options" defaultOpen={false}>
            <Row label="Format">
              <Segmented value={s.format} onChange={(v) => set("format", v)} items={[{ id: "png", label: "PNG" }, { id: "webp", label: "WebP" }]} />
            </Row>
            <Row label="Resolution">
              <Segmented value={s.scale} onChange={(v) => set("scale", v)} items={[1, 2, 3].map((x) => ({ id: x, label: `${x}×` }))} />
            </Row>
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

const PLATFORM_NAME = { x: "X", threads: "Threads", facebook: "Facebook" } as const;

/** Provenance kept outside the canvas, even when the image hides the author: for verification. */
function SourceInfo({ posts, extractedAt }: { posts: NormalizedPost[]; extractedAt?: string }) {
  const head = posts[0];
  const a = head.author;
  const author = [a.name, a.username && `@${a.username}`].filter(Boolean).join(" ");
  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <details className="group rounded-xl border border-line bg-surface text-xs">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-muted">
        <span>
          Source · {PLATFORM_NAME[head.platform]}
          {author && ` · ${author}`}
        </span>
        <span className="transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-line px-3 py-2.5">
        <dt className="text-muted">Platform</dt>
        <dd>{PLATFORM_NAME[head.platform]}</dd>
        <dt className="text-muted">Original author</dt>
        <dd>{author || "Unknown"}</dd>
        {head.timestamp && (
          <>
            <dt className="text-muted">Posted</dt>
            <dd>{fmt(head.timestamp)}</dd>
          </>
        )}
        <dt className="text-muted">Extracted</dt>
        <dd>{extractedAt ? fmt(extractedAt) : "Imported from JSON (not verified against the platform)"}</dd>
        <dt className="text-muted">{posts.length > 1 ? "Source URLs" : "Source URL"}</dt>
        <dd className="flex min-w-0 flex-col gap-0.5">
          {posts.map((p) => (
            <a key={p.sourceUrl} href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="truncate text-rust hover:underline">
              {p.sourceUrl.replace(/^https:\/\//, "")}
            </a>
          ))}
        </dd>
      </dl>
    </details>
  );
}


const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
const isTouch = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
const Key = ({ children }: { children: string }) => (
  <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink shadow-[0_1px_0_var(--color-line)]">{children}</kbd>
);

/** Step-by-step paste guide: X's composer link cannot carry images, so the image goes in by paste. */
function PasteSteps({
  paste,
  onCopy,
  onOpen,
  onDownload,
}: {
  paste: { count: number; copied: number | null; failed: boolean };
  onCopy: (i: number) => void;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const touch = isTouch();
  const step = "flex gap-2.5 text-[13px] leading-snug";
  const num = "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line text-[11px] tabular-nums text-muted";
  return (
    <ol className="flex flex-col gap-2.5 rounded-lg border border-line bg-paper p-3">
      <li className={step}>
        <span className={num}>1</span>
        {paste.failed ? (
          <span>
            Your browser would not copy the image.{" "}
            <button className="underline underline-offset-2 hover:text-rust" onClick={onDownload}>
              Download it
            </button>{" "}
            and attach it with the image button in X.
          </span>
        ) : (
          <span>{paste.copied !== null ? (paste.count > 1 ? `Image ${paste.copied + 1} of ${paste.count} copied.` : "Image copied.") : "Copying image…"}</span>
        )}
      </li>
      <li className={step}>
        <span className={num}>2</span>
        <span className="flex flex-1 items-center justify-between gap-2">
          Open the X post box.
          <button onClick={onOpen} className="rounded-md bg-ink px-2.5 py-1 text-[12px] font-medium text-paper hover:bg-rust">
            Open X
          </button>
        </span>
      </li>
      <li className={step}>
        <span className={num}>3</span>
        {touch ? (
          <span>Press and hold in the post box, then tap Paste.</span>
        ) : (
          <span className="flex flex-wrap items-center gap-1">
            Click the post box and press <Key>{isMac() ? "⌘" : "Ctrl"}</Key>+<Key>V</Key> to paste the image.
          </span>
        )}
      </li>
      {paste.count > 1 && !paste.failed && (
        <li className="flex flex-col gap-1.5 border-t border-line pt-2.5 text-[12px] text-muted">
          X pastes one image at a time. Copy the next one, then paste again:
          <span className="flex flex-wrap gap-1.5">
            {Array.from({ length: paste.count }, (_, i) => (
              <button
                key={i}
                onClick={() => onCopy(i)}
                className={`rounded-md border px-2 py-1 text-[12px] ${paste.copied === i ? "border-ink/40 text-ink" : "border-line hover:border-ink/40"}`}
              >
                {paste.copied === i ? `Image ${i + 1} copied` : `Copy image ${i + 1}`}
              </button>
            ))}
          </span>
        </li>
      )}
    </ol>
  );
}
