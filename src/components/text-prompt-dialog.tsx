"use client";

import { useId, useRef } from "react";
import { useDialogFocus } from "@/components/use-dialog-focus";

export function TextPromptDialog({
  open,
  title,
  message,
  label,
  value,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  error,
  onChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  label: string;
  value: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string | null;
  onChange: (value: string) => void;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const errorId = useId();

  useDialogFocus({
    open,
    dialogRef,
    initialFocusRef: inputRef,
    onClose: () => { if (!busy) onCancel(); },
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8"
      style={{ background: "rgba(0,0,0,0.38)", backdropFilter: "blur(4px)" }}
      onClick={(event) => { if (!busy && event.target === event.currentTarget) onCancel(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="glass-lg w-full max-w-md rounded-2xl p-6"
        style={{ background: "var(--surface-modal)" }}
      >
        <h2 id={titleId} className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
        <label htmlFor={inputId} className="section-label mt-5 block">{label}</label>
        <input
          ref={inputRef}
          id={inputId}
          className="glass-input mt-2 w-full"
          value={value}
          disabled={busy}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !busy) {
              event.preventDefault();
              void onConfirm();
            }
          }}
        />
        {error && <p id={errorId} role="alert" className="mt-2 text-xs" style={{ color: "var(--danger-text)" }}>{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-glass text-sm" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="btn-primary text-sm" disabled={busy} onClick={onConfirm}>{busy ? "Working..." : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
