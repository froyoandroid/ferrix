import { LIMITS, type MediaItem, type RenderOptions } from "@ferrix/shared";
import { Row, Segmented } from "./ui";

/** Read a local image, scaled down to 1600 px on the long side, as a data URL. */
async function localImage(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.86);
}

const src = (m: MediaItem) => {
  const u = m.type === "image" ? (m.url ?? m.thumbnailUrl) : m.thumbnailUrl;
  if (!u) return null;
  return u.startsWith("data:") ? u : `/api/img?u=${encodeURIComponent(u)}`;
};

const KIND = { image: "Image", video: "Video (poster)", gif: "GIF (still)" } as const;

/** Media controls: frame ratio, alt text display, and per item include, crop focus and alt text. */
export function MediaPanel({
  media,
  label,
  aspect,
  altMode,
  onAspect,
  onAltMode,
  onChange,
  compact,
}: {
  compact?: boolean;
  media: MediaItem[];
  label?: string;
  aspect: RenderOptions["mediaAspect"];
  altMode: RenderOptions["altText"];
  onAspect: (v: RenderOptions["mediaAspect"]) => void;
  onAltMode: (v: RenderOptions["altText"]) => void;
  onChange: (media: MediaItem[]) => void;
}) {
  const update = (i: number, patch: Partial<MediaItem>) => onChange(media.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const shown = media.filter((m) => !m.hidden).length;
  const replace = async (i: number, file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = await localImage(file);
    const m = media[i];
    update(i, m.type === "image" ? { url, width: undefined, height: undefined } : { thumbnailUrl: url });
  };

  return (
    <>
      {!compact && (<>
      <Row label="Frame">
        <Segmented
          small
          value={aspect}
          onChange={onAspect}
          items={[
            { id: "auto", label: "Auto" },
            { id: "16:9", label: "16:9" },
            { id: "3:2", label: "3:2" },
            { id: "1:1", label: "1:1" },
            { id: "4:5", label: "4:5" },
          ]}
        />
      </Row>
      <Row label="Alt text">
        <Segmented small value={altMode} onChange={onAltMode} items={[{ id: "off", label: "Off" }, { id: "badge", label: "Badge" }, { id: "caption", label: "Caption" }]} />
      </Row>
      </>)}
      {label && <p className="text-[11px] text-muted">{label}</p>}
      <ul className="flex flex-col gap-3">
        {media.map((m, i) => {
          const s = src(m);
          const fx = m.focusX ?? 0.5;
          const fy = m.focusY ?? 0.5;
          return (
            <li key={i} className={`flex gap-3 rounded-lg border border-line bg-paper p-2 ${m.hidden ? "opacity-50" : ""}`}>
              <button
                type="button"
                title="Click to set the crop focus"
                className="relative h-20 w-20 shrink-0 cursor-crosshair overflow-hidden rounded-md bg-canvas"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
                  update(i, { focusX: clamp((e.clientX - r.left) / r.width), focusY: clamp((e.clientY - r.top) / r.height) });
                }}
              >
                {s ? <img src={s} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${fx * 100}% ${fy * 100}%` }} /> : <span className="text-[10px] text-muted">No preview</span>}
                <span
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                  style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
                />
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] text-muted">
                  <span>
                    {i + 1}. {KIND[m.type]}
                  </span>
                  <span className="flex items-center gap-2">
                    <label className="cursor-pointer hover:text-ink" title={m.type === "image" ? "Use a local image instead" : "Use a still image as the poster"}>
                      {s ? "Replace" : "Add still"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => replace(i, e.target.files?.[0])} />
                    </label>
                    {(m.focusX !== undefined || m.focusY !== undefined) && (
                      <button className="hover:text-ink" onClick={() => update(i, { focusX: undefined, focusY: undefined })}>
                        Centre
                      </button>
                    )}
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="accent-[#a8502b]"
                        checked={!m.hidden}
                        onChange={(e) => update(i, { hidden: e.target.checked ? undefined : true })}
                      />
                      Show
                    </label>
                  </span>
                </div>
                <textarea
                  className="h-12 w-full resize-none rounded-md border border-line bg-surface px-2 py-1 text-xs leading-snug outline-none focus:border-ink/40"
                  placeholder="Alt text (describe the image)"
                  maxLength={2000}
                  value={m.altText ?? ""}
                  onChange={(e) => update(i, { altText: e.target.value || undefined })}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {shown > LIMITS.mediaShown && (
        <p className="text-[11px] leading-relaxed text-rust">
          {shown} items are shown; only the first {LIMITS.mediaShown} fit in the image. Untick the ones to leave out.
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-muted">Click a thumbnail to choose what stays in frame when the image is cropped.</p>
    </>
  );
}
