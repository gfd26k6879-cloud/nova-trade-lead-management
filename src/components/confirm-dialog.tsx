"use client";

import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onCancel();
      };
      window.addEventListener("keydown", handleKey);
      return () => window.removeEventListener("keydown", handleKey);
    }
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={dialogRef}
        className="glass-lg w-full max-w-sm rounded-2xl p-6"
      >
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{message}</p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button type="button" className="btn-glass text-xs" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="btn-primary text-xs" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
