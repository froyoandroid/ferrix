import type { MediaItem, RenderOptions } from "@ferrix/shared";
import { Row, Segmented } from "./ui";

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
}: {
  media: MediaItem[];
  label?: string;
  aspect: RenderOptions["mediaAspect"];
  altMode: RenderOptions["altText"];
  onAspect: (v: RenderOptions["mediaAspect"]) => void;
  onAltMode: (v: RenderOptions["altText"]) => void;
  onChange: (media: MediaItem[]) => void;
}) {
  const update = (i: number, patch: Partial<MediaItem>) => onChange(media.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <>
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
      <p className="text-[11px] leading-relaxed text-muted">Click a thumbnail to choose what stays in frame when the image is cropped.</p>
    </>
  );
}
