import type { CSSProperties } from "react";

export type StatusTone = "muted" | "info" | "success" | "warning" | "danger";

const STATUS_TONE_TOKENS: Record<StatusTone, { background: string; border: string; text: string }> = {
  muted: {
    background: "var(--status-muted-bg)",
    border: "var(--status-muted-border)",
    text: "var(--status-muted-text)",
  },
  info: {
    background: "var(--info-bg)",
    border: "var(--info-border)",
    text: "var(--info-text)",
  },
  success: {
    background: "var(--success-bg)",
    border: "var(--success-border)",
    text: "var(--success-text)",
  },
  warning: {
    background: "var(--warning-bg)",
    border: "var(--warning-border)",
    text: "var(--warning-text)",
  },
  danger: {
    background: "var(--danger-bg)",
    border: "var(--danger-border)",
    text: "var(--danger-text)",
  },
};

export function getStatusToneStyle(tone: StatusTone): CSSProperties {
  const tokens = STATUS_TONE_TOKENS[tone];
  return {
    background: tokens.background,
    borderColor: tokens.border,
    color: tokens.text,
  };
}

export function getStatusToneColor(tone: StatusTone): string {
  return STATUS_TONE_TOKENS[tone].text;
}
