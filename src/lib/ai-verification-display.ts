export type AiVerificationTone = "muted" | "pending" | "good" | "warning" | "bad" | "review";

export interface AiVerificationDisplayInput {
  status?: string | null;
  checkedAt?: string | null;
  queueStatus?: string | null;
  viability?: string | null;
}

export interface AiVerificationDisplay {
  label: string;
  detail: string;
  tone: AiVerificationTone;
  hasRun: boolean;
}

export function getAiVerificationDisplay(input: AiVerificationDisplayInput): AiVerificationDisplay {
  const status = normalize(input.status);
  const queueStatus = normalize(input.queueStatus);
  const viability = normalize(input.viability);
  const hasCheckedAt = Boolean(input.checkedAt);

  if ((status === "not_checked" || !status) && queueStatus === "queued") {
    return {
      label: "Waiting for AI",
      detail: "This lead is in the AI verification queue. No result exists yet; a worker still has to process it.",
      tone: "pending",
      hasRun: false,
    };
  }

  if ((status === "not_checked" || !status) && queueStatus === "running") {
    return {
      label: "AI processing",
      detail: "AI verification is running now. Wait for the result before deciding whether the lead has no website.",
      tone: "pending",
      hasRun: false,
    };
  }

  if (status === "error" || queueStatus === "error") {
    return {
      label: "AI run failed",
      detail: "AI verification was attempted but failed.",
      tone: "bad",
      hasRun: true,
    };
  }

  if ((status === "not_checked" || !status) && !hasCheckedAt) {
    return {
      label: "Not sent to AI",
      detail: "This lead has not been queued or processed for AI verification.",
      tone: "muted",
      hasRun: false,
    };
  }

  if (status === "no_site_found") {
    return {
      label: "AI run: no usable site",
      detail: "AI verification completed and did not find a usable business website.",
      tone: "good",
      hasRun: true,
    };
  }

  if (status === "weak_site_found") {
    return {
      label: viability === "broken" ? "AI run: weak/broken site" : "AI run: weak site",
      detail: "AI verification completed and found a weak or questionable website.",
      tone: "warning",
      hasRun: true,
    };
  }

  if (status === "site_found") {
    return {
      label: viability === "usable" ? "AI run: usable site" : "AI run: site found",
      detail: "AI verification completed and found an existing website candidate.",
      tone: viability === "usable" ? "bad" : "review",
      hasRun: true,
    };
  }

  if (status === "uncertain") {
    return {
      label: "AI run: uncertain",
      detail: "AI verification completed but needs human review.",
      tone: "review",
      hasRun: true,
    };
  }

  if (status === "mismatch") {
    return {
      label: "AI run: mismatch",
      detail: "AI verification completed but likely matched the wrong business.",
      tone: "review",
      hasRun: true,
    };
  }

  return {
    label: hasCheckedAt ? `AI run: ${status.replace(/_/g, " ")}` : "AI status unknown",
    detail: hasCheckedAt ? "AI verification completed." : "AI verification status is unknown.",
    tone: hasCheckedAt ? "review" : "muted",
    hasRun: hasCheckedAt,
  };
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}
