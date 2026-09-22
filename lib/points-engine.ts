import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUsers } from "@/lib/email";

type Admin = ReturnType<typeof createAdminClient>;

export async function classTotal(admin: Admin, classId: string, userId: string): Promise<number> {
  const { data } = await admin.from("points").select("points").eq("class_id", classId).eq("user_id", userId);
  return ((data ?? []) as { points: number }[]).reduce((n, r) => n + Number(r.points), 0);
}

export async function awardRule(
  admin: Admin,
  args: { class_id: string; user_id: string; code: string; dedupe_key: string; awarded_by: string | null }
): Promise<boolean> {
  const { data: rule } = await admin.from("point_rules").select("id,points").eq("class_id", args.class_id).eq("code", args.code).eq("active", true).single();
  if (!rule) return false;
  const { error } = await admin.from("points").insert({
    class_id: args.class_id, user_id: args.user_id, rule_id: (rule as { id: string }).id,
    points: (rule as { points: number }).points, reason: args.code, dedupe_key: args.dedupe_key, awarded_by: args.awarded_by,
  });
  if (error) return false;
  await maybeAchievements(admin, args.class_id, args.user_id);
  return true;
}

export async function grantAchievement(admin: Admin, classId: string, userId: string, code: string, metadata: Record<string, unknown> = {}): Promise<boolean> {
  const { error } = await admin.from("student_achievements").insert({ achievement_code: code, user_id: userId, class_id: classId, metadata });
  if (error) return false;
  await notifyUsers(admin, {
    user_ids: [userId], type: "achievement", title: "Achievement unlocked!",
    body: code.replace(/_/g, " "), link: `/dashboard/classes/${classId}`,
  });
  return true;
}

export async function maybeAchievements(admin: Admin, classId: string, userId: string): Promise<string[]> {
  const awarded: string[] = [];
  const { data: asgs } = await admin.from("assignments").select("id").eq("class_id", classId).is("deleted_at", null);
  const aids = ((asgs ?? []) as { id: string }[]).map((a) => a.id);
  if (aids.length) {
    const { count } = await admin.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("student_id", userId).in("assignment_id", aids);
    if ((count ?? 0) > 0 && (await grantAchievement(admin, classId, userId, "first_assignment"))) awarded.push("first_assignment");
  }
  const total = await classTotal(admin, classId, userId);
  if (total >= 100 && (await grantAchievement(admin, classId, userId, "points_100", { total }))) awarded.push("points_100");
  if (total >= 500 && (await grantAchievement(admin, classId, userId, "points_500", { total }))) awarded.push("points_500");

  const { data: subs } = await admin.from("assignment_submissions").select("submitted_at").eq("student_id", userId).order("submitted_at", { ascending: false }).limit(60);
  const days = [...new Set(((subs ?? []) as { submitted_at: string }[]).map((s) => new Date(s.submitted_at).toISOString().slice(0, 10)))].sort().reverse();
  let streak = 0;
  const cursor = new Date();
  if (!days.includes(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (days.includes(cursor.toISOString().slice(0, 10))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  if (streak >= 7 && (await grantAchievement(admin, classId, userId, "streak_7", { streak }))) awarded.push("streak_7");

  const { count: present } = await admin.from("attendance").select("id", { count: "exact", head: true })
    .eq("class_id", classId).eq("student_id", userId).in("status", ["present", "late"]);
  if ((present ?? 0) >= 10 && (await grantAchievement(admin, classId, userId, "attendance_star", { sessions: present }))) awarded.push("attendance_star");
  return awarded;
}
