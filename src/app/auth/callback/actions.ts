"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { z } from "zod";

import { normalizeAuthNextPath } from "@/lib/auth-redirect";
import { recordOperationalEvent } from "@/lib/operational-logging";
import { startRouteTiming } from "@/lib/route-timing";
import { createSupabaseServerClient, isSupabaseAuthConfigured } from "@/lib/supabase/server";

const confirmAuthLinkSchema = z.object({
  tokenHash: z.string().trim().min(16),
  type: z.enum(["invite", "recovery"]),
  next: z.string().trim().optional(),
});

export async function confirmRecoveryTokenAction(formData: FormData) {
  const logRouteTiming = startRouteTiming("/auth/callback");

  if (!isSupabaseAuthConfigured()) {
    logRouteTiming(500, { reason: "missing_auth_config" });
    await recordOperationalEvent({
      action: "auth_link_verify_failed",
      category: "auth",
      severity: "error",
      entityType: "auth",
      metadata: { reason: "missing_auth_config" },
    });
    redirect("/login?error=missing_config");
  }

  const parsed = confirmAuthLinkSchema.safeParse({
    tokenHash: formData.get("tokenHash"),
    type: formData.get("type"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    logRouteTiming(400, { reason: "invalid_auth_link_token" });
    await recordOperationalEvent({
      action: "auth_link_verify_failed",
      category: "auth",
      severity: "warn",
      entityType: "auth",
      metadata: { reason: "invalid_auth_link_token" },
    });
    redirect("/forgot-password?error=invalid_recovery_link");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: parsed.data.tokenHash,
    type: parsed.data.type as EmailOtpType,
  });

  if (error) {
    logRouteTiming(400, { reason: "verify_otp_failed", error: error.message });
    await recordOperationalEvent({
      action: "auth_link_verify_failed",
      category: "auth",
      severity: "warn",
      entityType: "auth",
      metadata: { reason: "verify_otp_failed", type: parsed.data.type, error: error.message },
    });
    redirect("/forgot-password?error=expired_link");
  }

  const next = normalizeAuthNextPath(parsed.data.next);
  await recordOperationalEvent({
    action: "auth_link_verified",
    category: "auth",
    severity: "info",
    entityType: "auth",
    metadata: { type: parsed.data.type, next },
  });
  logRouteTiming(307, { result: "auth_link_verified", type: parsed.data.type, next });
  redirect(next);
}
