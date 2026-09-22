"use server";

import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string;
  read_at: string | null;
  created_at: string;
}

export async function getNotificationsAction(): Promise<{ notifications: Notification[]; unread: number }> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data } = await admin.from("notifications").select("*").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(50);
  const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", viewer.id).is("read_at", null);
  return { notifications: (data ?? []) as Notification[], unread: count ?? 0 };
}

export async function markNotificationsAction(ids: string[] | "all"): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  if (ids === "all") {
    await admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", viewer.id).is("read_at", null);
    return;
  }
  if (!Array.isArray(ids) || !ids.length || ids.length > 50) throw new Error("Invalid request.");
  await admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", viewer.id).in("id", ids);
}
