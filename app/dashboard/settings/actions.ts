"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function validHex(c: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(c);
}

export async function updateSettingsAction(_prev: string | null, form: FormData): Promise<string | null> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const fullName = String(form.get("full_name") ?? "").trim().slice(0, 120);
  const primary = String(form.get("primary") ?? "");
  const secondary = String(form.get("secondary") ?? "");
  const mode = String(form.get("mode") ?? "light");
  const emailNotif = form.get("email_notif") === "on";
  if (!validHex(primary) || !validHex(secondary) || !["light", "dark"].includes(mode)) {
    return "Invalid theme.";
  }
  const { error } = await admin.from("profiles").update({
    full_name: fullName,
    theme: { primary, secondary, mode },
    email_notifications: emailNotif,
  }).eq("id", viewer.id);
  if (error) return "Something went wrong. Please try again.";
  await admin.from("activity_logs").insert({ actor_id: viewer.id, action: "profile.update", metadata: {} });
  revalidatePath("/dashboard/settings");
  return null;
}
