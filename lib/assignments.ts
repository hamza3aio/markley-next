import { createAdminClient } from "@/lib/supabase/admin";
import type { Viewer } from "@/lib/auth";
import { isAdmin as _isAdmin } from "@/lib/perms";
import { activeMembership } from "@/lib/members";

type Admin = ReturnType<typeof createAdminClient>;

export interface AssignmentRow {
  id: string;
  class_id: string;
  title: string;
  type: string;
  status: string;
  due_date: string | null;
  allow_late: boolean;
  max_points: number;
  description: string;
  instructions: string;
  created_at: string;
}

export async function listAssignments(admin: Admin, viewer: Viewer, classId: string) {
  const { data: cls } = await admin.from("classes").select("id,teacher_id").eq("id", classId).is("deleted_at", null).single();
  if (!cls) return null;
  const member = await activeMembership(admin, classId, viewer.id);
  const staff =
    _isAdmin(viewer) || cls.teacher_id === viewer.id ||
    (!!member && (member.role_in_class === "teacher" || member.role_in_class === "assistant"));
  if (!member && !_isAdmin(viewer)) {
    if (viewer.profile.role !== "parent") return null;
    const { data: links } = await admin.from("parent_student_links").select("student_id").eq("parent_id", viewer.id).eq("status", "active");
    const sids = (links ?? []).map((l) => l.student_id as string);
    let ok = false;
    if (sids.length) {
      const { data: m } = await admin.from("class_members").select("id").eq("class_id", classId).in("user_id", sids).eq("status", "active").limit(1);
      ok = !!m?.length;
    }
    if (!ok) return null;
  }
  let q = admin.from("assignments").select("id,title,type,status,due_date,allow_late,max_points,created_at").eq("class_id", classId).is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
  if (!staff) q = q.eq("status", "published");
  const { data } = await q;
  let submittedIds: string[] = [];
  if (member?.role_in_class === "student") {
    const { data: subs } = await admin.from("assignment_submissions").select("assignment_id").eq("student_id", viewer.id);
    submittedIds = (subs ?? []).map((s) => s.assignment_id as string);
  }
  return { assignments: (data ?? []) as AssignmentRow[], submittedIds, staff };
}
