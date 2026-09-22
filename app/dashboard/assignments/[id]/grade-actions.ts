"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassAccess } from "@/lib/classes";
import { logActivity } from "@/lib/activity";
import { awardRule, grantAchievement } from "@/lib/points-engine";

async function staffCheck(assignmentId: string) {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: asg } = await admin.from("assignments").select("id,class_id,max_points").eq("id", assignmentId).is("deleted_at", null).single();
  if (!asg) throw new Error("Assignment not found.");
  const access = await getClassAccess(admin, viewer, asg.class_id as string);
  if (!access) throw new Error("Assignment not found.");
  const member = access.member;
  const staff =
    isAdmin(viewer) || access.cls.teacher_id === viewer.id ||
    (!!member && (member.role_in_class === "teacher" || member.role_in_class === "assistant"));
  if (!staff) throw new Error("Only class staff can manage grades.");
  if (!can(viewer, "assignment.grade") && !isAdmin(viewer) && access.cls.teacher_id !== viewer.id) {
    throw new Error("You do not have permission to grade.");
  }
  return { viewer, admin, asg: asg as { id: string; class_id: string; max_points: number } };
}

export async function saveGradeAction(assignmentId: string, studentId: string, score: number, feedback: string): Promise<{ score: number }> {
  const { viewer, admin, asg } = await staffCheck(assignmentId);
  if (!Number.isFinite(score) || score < 0 || score > asg.max_points) {
    throw new Error(`Score must be 0–${asg.max_points}.`);
  }
  if (feedback.length > 2000) throw new Error("Feedback is too long.");
  const { data: mem } = await admin.from("class_members").select("id").eq("class_id", asg.class_id).eq("user_id", studentId).limit(1);
  if (!mem?.length) throw new Error("Student is not in this class.");
  const rounded = Math.round(score * 100) / 100;
  const { error } = await admin.from("grades").upsert({
    assignment_id: assignmentId, student_id: studentId, score: rounded, max_points: asg.max_points,
    feedback: feedback.trim(), graded_by: viewer.id, grading_source: "manual",
  }, { onConflict: "assignment_id,student_id" });
  if (error) throw new Error("Something went wrong. Please try again.");
  await admin.from("assignment_submissions").update({ status: "graded" }).eq("assignment_id", assignmentId).eq("student_id", studentId);
  await logActivity(admin, viewer, "grade.change", "assignment", assignmentId, { student_id: studentId, score: rounded });
  if (rounded >= asg.max_points) {
    await awardRule(admin, { class_id: asg.class_id, user_id: studentId, code: "perfect_score", dedupe_key: `perfect:${assignmentId}`, awarded_by: viewer.id });
    await grantAchievement(admin, asg.class_id, studentId, "perfect_score", { assignment_id: assignmentId });
  }
  revalidatePath(`/dashboard/assignments/${assignmentId}`);
  return { score: rounded };
}

export async function getGradesAction(assignmentId: string) {
  const { admin } = await staffCheck(assignmentId);
  const { data } = await admin.from("grades").select("*").eq("assignment_id", assignmentId);
  return (data ?? []) as { student_id: string; score: number; feedback: string }[];
}
