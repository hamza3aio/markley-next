"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Invalid email or password.";
  if (m.includes("email not confirmed")) return "Please verify your email before signing in.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Please wait and try again.";
  return "Something went wrong. Please try again.";
}

export async function signInAction(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return "Email and password are required.";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return friendly(error?.message ?? "");

  // Server-side gate (mirrors the old /api/me): verified + active profile.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("status")
    .eq("id", data.session.user.id)
    .single();
  if (!profile) {
    await supabase.auth.signOut();
    return "Account not provisioned. Contact admin.";
  }
  if (profile.status !== "active") {
    await supabase.auth.signOut();
    return "Account is not active. Contact admin.";
  }

  await admin.from("activity_logs").insert({
    actor_id: data.session.user.id,
    action: "login",
    metadata: {},
  });
  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
