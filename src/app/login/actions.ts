"use server";

import { redirect } from "next/navigation";

import { createSession, destroySession, isAuthConfigured, verifyCredentials } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  if (!(await isAuthConfigured())) {
    redirect("/login?error=missing_config");
  }

  const username = formData.get("username");
  const password = formData.get("password");

  if (typeof username !== "string" || typeof password !== "string") {
    redirect("/login?error=invalid_credentials");
  }

  const valid = await verifyCredentials(username, password);

  if (!valid) {
    redirect("/login?error=invalid_credentials");
  }

  await createSession();
  redirect("/queue");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
