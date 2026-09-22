import { createAdminClient } from "@/lib/supabase/admin";
import type { Viewer } from "@/lib/auth";
import { isAdmin as _isAdmin } from "@/lib/perms";

export interface ClassRow {
  id: string;
  name: string;
  subject: string;
  description: string;
  teacher_id: string | null;
  leaderboard_enabled: boolean;
  leaderboard_show_names: boolean;
  created_at: string;
}

export interface ClassAccess {
  cls: ClassRow;
  member: { id: string; role_in_class: string } | null;
  staff: boolean;
  parentOk: boolean;
  teacher: { id: string; full_name: string; email: string } | null;
}

type Admin = ReturnType<typeof createAdminClient>;

export async function myClassIds(admin: Admin, viewer: Viewer): Promise<string[]> {
  if (_isAdmin(viewer)) {
    const { data } = await admin.from("classes").select("id").is("deleted_at", null).limit(500);
    return (data ?? []).map((c) => c.id as string);
  }
  if (viewer.profile.role === "parent") {
    const { data: links } = await admin
      .from("parent_student_links")
      .select("student_id")
      .eq("parent_id", viewer.id)
      .eq("status", "active");
    const sids = (links ?? []).map((l) => l.student_id as string);
    if (!sids.length) return [];
    const { data: ms } = await admin
      .from("class_members")
      .select("class_id")
      .in("user_id", sids)
      .eq("status", "active");
    return [...new Set((ms ?? []).map((m) => m.class_id as string))];
  }
  const { data: ms } = await admin
    .from("class_members")
    .select("class_id")
    .eq("user_id", viewer.id)
    .eq("status", "active");
  return [...new Set((ms ?? []).map((m) => m.class_id as string))];
}

export async function getClasses(admin: Admin, viewer: Viewer) {
  const ids = await myClassIds(admin, viewer);
  if (!ids.length) return [];
  const { data } = await admin
    .from("classes")
    .select("id,name,subject,description,teacher_id,leaderboard_enabled,leaderboard_show_names,created_at")
    .in("id", ids)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as ClassRow[];
}

export async function getClassAccess(
  admin: Admin,
  viewer: Viewer,
  classId: string
): Promise<ClassAccess | null> {
  const { data: cls } = await admin
    .from("classes")
    .select("id,name,subject,description,teacher_id,leaderboard_enabled,leaderboard_show_names,created_at")
    .eq("id", classId)
    .is("deleted_at", null)
    .single();
  if (!cls) return null;

  const { data: member } = await admin
    .from("class_members")
    .select("id,role_in_class")
    .eq("class_id", classId)
    .eq("user_id", viewer.id)
    .eq("status", "active")
    .single();

  let parentOk = false;
  if (!member && !_isAdmin(viewer) && viewer.profile.role === "parent") {
    const { data: links } = await admin
      .from("parent_student_links")
      .select("student_id")
      .eq("parent_id", viewer.id)
      .eq("status", "active");
    const sids = (links ?? []).map((l) => l.student_id as string);
    if (sids.length) {
      const { data: m } = await admin
        .from("class_members")
        .select("id")
        .eq("class_id", classId)
        .in("user_id", sids)
        .eq("status", "active")
        .limit(1);
      parentOk = !!m?.length;
    }
  }
  if (!member && !_isAdmin(viewer) && !parentOk) return null;

  const staff =
    _isAdmin(viewer) ||
    cls.teacher_id === viewer.id ||
    !!member;
  const staffRole =
    _isAdmin(viewer) ||
    cls.teacher_id === viewer.id ||
    (member && (member.role_in_class === "teacher" || member.role_in_class === "assistant"));

  let teacher: ClassAccess["teacher"] = null;
  if (cls.teacher_id) {
    const { data: t } = await admin
      .from("profiles")
      .select("id,full_name,email")
      .eq("id", cls.teacher_id)
      .single();
    teacher = (t as ClassAccess["teacher"]) ?? null;
  }
  return { cls: cls as ClassRow, member: (member as ClassAccess["member"]) ?? null, staff: !!staffRole && !!staff, parentOk, teacher };
}

export async function getMembers(admin: Admin, classId: string) {
  const { data: members } = await admin
    .from("class_members")
    .select("id,user_id,role_in_class,status,joined_at")
    .eq("class_id", classId)
    .eq("status", "active")
    .order("joined_at", { ascending: true });
  const uids = (members ?? []).map((m) => m.user_id as string);
  let byId: Record<string, { id: string; full_name: string; email: string; role: string }> = {};
  if (uids.length) {
    const { data: profs } = await admin.from("profiles").select("id,full_name,email,role").in("id", uids);
    byId = Object.fromEntries((profs ?? []).map((p) => [p.id as string, p as never]));
  }
  return (members ?? []).map((m) => ({ ...m, profile: byId[m.user_id as string] ?? null }));
}
