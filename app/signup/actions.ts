"use server";

import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  ok?: boolean;
}

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const fullName = String(form.get("name") ?? "").trim().slice(0, 120);
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!fullName || !email || password.length < 8) {
    return { error: "Name, valid email and 8+ character password are required." };
  }
  const supabase = await createClient();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${appUrl.replace(/\/$/, "")}/login`,
    },
  });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("already registered") || m.includes("already exists")) {
      return { error: "This email is already registered. Try signing in." };
    }
    return { error: "Something went wrong. Please try again." };
  }
  return { ok: true };
}

export async function resetAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  if (!email) return { error: "Email is required." };
  const supabase = await createClient();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl.replace(/\/$/, "")}/login`,
  });
  if (error) return { error: "Something went wrong. Please try again." };
  return { ok: true };
}
