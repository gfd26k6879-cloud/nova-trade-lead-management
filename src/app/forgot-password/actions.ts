"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { buildAuthCallbackUrl, resolveCanonicalAppUrl } from "@/lib/app-url";
import { isAuthConfigured } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const resetRequestSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
});

export async function requestPasswordResetAction(formData: FormData) {
  if (!(await isAuthConfigured())) {
    redirect("/forgot-password?error=missing_config");
  }

  const parsed = resetRequestSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    redirect("/forgot-password?error=invalid_email");
  }

  const headerStore = await headers();
  const origin = resolveCanonicalAppUrl(headerStore.get("origin"));

  if (!origin) {
    redirect("/forgot-password?error=missing_origin");
  }

  const redirectTo = buildAuthCallbackUrl("/reset-password", origin);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/forgot-password?sent=1");
}
