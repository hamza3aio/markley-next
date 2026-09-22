"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassAccess } from "@/lib/classes";
import { logActivity } from "@/lib/activity";
import { awardRule } from "@/lib/points-engine";

const STATUSES = ["present", "absent", "late", "excused"];

export async function markAttendanceAction(
  classId: string,
  date: string,
  records: { student_id: string; status: string }[]
): Promise<{ count: number }> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > new Date().toISOString().slice(0, 10)) {
    throw new Error("Date must be today or earlier (YYYY-MM-DD).");
  }
  const access = await getClassAccess(admin, viewer, classId);
  if (!access) throw new Error("Class not found.");
  const member = access.member;
  const staff =
    isAdmin(viewer) || access.cls.teacher_id === viewer.id ||
    (!!member && (member.role_in_class === "teacher" || member.role_in_class === "assistant"));
  if (!staff) throw new Error("Only class staff can mark attendance.");
  if (!Array.isArray(records) || !records.length || records.length > 500) {
    throw new Error("Provide 1–500 attendance records.");
  }
  const { data: students } = await admin.from("class_members").select("user_id").eq("class_id", classId).eq("role_in_class", "student").eq("status", "active");
  const enrolled = new Set(((students ?? []) as { user_id: string }[]).map((s) => s.user_id));
  for (const r of records) {
    if (!enrolled.has(r.student_id) || !STATUSES.includes(r.status)) throw new Error("Invalid attendance record.");
  }
  const { error } = await admin.from("attendance").upsert(
    records.map((r) => ({ class_id: classId, student_id: r.student_id, date, status: r.status, marked_by: viewer.id })),
    { onConflict: "class_id,date,student_id" }
  );
  if (error) throw new Error("Something went wrong. Please try again.");
  await logActivity(admin, viewer, "attendance.mark", "class", classId, { date, count: records.length });
  for (const r of records) {
    if (r.status === "present" || r.status === "late") {
      awardRule(admin, { class_id: classId, user_id: r.student_id, code: "attendance", dedupe_key: `attend:${date}`, awarded_by: viewer.id }).catch(() => {});
    }
  }
  revalidatePath(`/dashboard/classes/${classId}`);
  return { count: records.length };
}

export async function getAttendanceAction(classId: string, from: string, to: string) {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const access = await getClassAccess(admin, viewer, classId);
  if (!access) throw new Error("Class not found.");
  const member = access.member;
  const staff =
    isAdmin(viewer) || access.cls.teacher_id === viewer.id ||
    (!!member && (member.role_in_class === "teacher" || member.role_in_class === "assistant"));
  let q = admin.from("attendance").select("*").eq("class_id", classId).order("date", { ascending: false }).limit(1000);
  if (from) q = q.gte("date", from);
  if (to) q = q.lte("date", to);
  if (!staff) {
    if (member?.role_in_class === "student") q = q.eq("student_id", viewer.id);
    else if (viewer.profile.role === "parent") {
      const { data: links } = await admin.from("parent_student_links").select("student_id").eq("parent_id", viewer.id).eq("status", "active");
      const sids = ((links ?? []) as { student_id: string }[]).map((l) => l.student_id);
      if (!sids.length) return [];
      q = q.in("student_id", sids);
    } else throw new Error("You do not have access to attendance.");
  }
  const { data } = await q;
  return (data ?? []) as { student_id: string; date: string; status: string }[];
}
