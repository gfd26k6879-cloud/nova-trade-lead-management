"use client";

import { useId, useRef } from "react";
import { useDialogFocus } from "@/components/use-dialog-focus";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useDialogFocus({
    open,
    dialogRef,
    initialFocusRef: cancelButtonRef,
    onClose: () => { if (!busy) onCancel(); },
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (!busy && e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="glass-lg w-full max-w-sm rounded-2xl p-6"
      >
        <h3 id={titleId} className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
        <p id={descriptionId} className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button ref={cancelButtonRef} type="button" className="btn-glass text-xs" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="btn-primary text-xs" disabled={busy} onClick={onConfirm}>{busy ? "Working..." : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
