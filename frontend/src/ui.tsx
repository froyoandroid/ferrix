import type { ReactNode } from "react";

export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
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

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] text-muted">{label}</span>
      {children}
    </div>
  );
}

export function Toggle({
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

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
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

export function Segmented<T extends string | number>({
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
