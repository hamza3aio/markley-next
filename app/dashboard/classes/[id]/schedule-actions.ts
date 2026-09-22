"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassAccess } from "@/lib/classes";
import { logActivity } from "@/lib/activity";
import { notifyUsers, sendEmail, appLink } from "@/lib/email";

const PROVIDERS = ["zoom", "teams", "meet", "other"];

async function staffOf(classId: string) {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const access = await getClassAccess(admin, viewer, classId);
  if (!access) throw new Error("Class not found.");
  const member = access.member;
  const staff =
    isAdmin(viewer) || access.cls.teacher_id === viewer.id ||
    (!!member && (member.role_in_class === "teacher" || member.role_in_class === "assistant"));
  return { viewer, admin, access, staff };
}

export async function createSessionAction(
  classId: string,
  input: { title: string; description: string; start_at: string; end_at: string; meeting_url: string; provider: string }
): Promise<void> {
  const { viewer, admin, access, staff } = await staffOf(classId);
  if (!staff) throw new Error("Only class staff can create sessions.");
  if (input.title.trim().length < 3 || input.title.trim().length > 200) throw new Error("Title must be 3-200 characters.");
  if (input.description.length > 2000) throw new Error("Description is too long.");
  const start = new Date(input.start_at);
  const end = new Date(input.end_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error("Invalid session time.");
  if (input.meeting_url && !/^https:\/\//i.test(input.meeting_url.trim())) throw new Error("Meeting link must start with https://.");
  if (!PROVIDERS.includes(input.provider)) throw new Error("Invalid provider.");

  const { data, error } = await admin.from("sessions").insert({
    class_id: classId, title: input.title.trim(), description: input.description.trim(),
    start_at: start.toISOString(), end_at: end.toISOString(),
    meeting_url: input.meeting_url.trim(), provider: input.provider, created_by: viewer.id,
  }).select("id").single();
  if (error || !data) throw new Error("Something went wrong. Please try again.");

  const { data: members } = await admin.from("class_members").select("user_id").eq("class_id", classId).eq("status", "active");
  const ids = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id).filter((x) => x !== viewer.id);
  const link = appLink(`/dashboard/classes/${classId}`);
  await notifyUsers(admin, { user_ids: ids, type: "session", title: `New session: ${input.title.trim()}`, body: `${access.cls.name} · ${start.toLocaleString()}`, link });
  sendEmail(admin, ids, `New session: ${input.title.trim()}`, `New live session in ${access.cls.name}`, `<p><b>${input.title.trim()}</b> — ${start.toLocaleString()}</p>`, link).catch(() => {});
  await logActivity(admin, viewer, "session.create", "class", classId, { session_id: data.id });
  revalidatePath(`/dashboard/classes/${classId}`);
}

export async function deleteSessionAction(sessionId: string, classId: string): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: s } = await admin.from("sessions").select("*").eq("id", sessionId).is("deleted_at", null).single();
  if (!s) throw new Error("Session not found.");
  const { data: cls } = await admin.from("classes").select("teacher_id").eq("id", (s as { class_id: string }).class_id).single();
  if (!isAdmin(viewer) && cls?.teacher_id !== viewer.id && (s as { created_by: string }).created_by !== viewer.id) {
    throw new Error("You do not have permission to delete this session.");
  }
  await admin.from("sessions").update({ deleted_at: new Date().toISOString() }).eq("id", sessionId);
  await logActivity(admin, viewer, "session.delete", "session", sessionId, {});
  revalidatePath(`/dashboard/classes/${classId}`);
}

const EVENT_TYPES = ["event", "exam", "deadline"];

export async function createEventAction(
  classId: string,
  input: { title: string; description: string; type: string; start_at: string; end_at: string | null; link: string }
): Promise<void> {
  const { viewer, admin, staff } = await staffOf(classId);
  if (!staff) throw new Error("Only class staff can create events.");
  if (input.title.trim().length < 3 || input.title.trim().length > 200) throw new Error("Title must be 3-200 characters.");
  if (input.description.length > 2000) throw new Error("Description is too long.");
  if (!EVENT_TYPES.includes(input.type)) throw new Error("Invalid event type.");
  const start = new Date(input.start_at);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid start time.");
  let end: string | null = null;
  if (input.end_at) {
    const e = new Date(input.end_at);
    if (Number.isNaN(e.getTime()) || e <= start) throw new Error("Invalid end time.");
    end = e.toISOString();
  }
  const { error } = await admin.from("calendar_events").insert({
    class_id: classId, title: input.title.trim(), description: input.description.trim(), type: input.type,
    start_at: start.toISOString(), end_at: end, link: input.link.trim().slice(0, 2000), created_by: viewer.id,
  });
  if (error) throw new Error("Something went wrong. Please try again.");
  await logActivity(admin, viewer, "event.create", "class", classId, {});
  revalidatePath(`/dashboard/classes/${classId}`);
}
