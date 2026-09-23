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

export async function getSuggestionsAction(assignmentId: string) {
  const { admin } = await staffCheck(assignmentId);
  const { data } = await admin.from("ai_grading_suggestions").select("*").eq("assignment_id", assignmentId).eq("status", "pending").order("created_at", { ascending: false });
  return (data ?? []) as { id: string; student_id: string; suggested_score: number; suggested_feedback: string; criteria: string; confidence: string }[];
}

export async function suggestForAction(assignmentId: string, studentId: string): Promise<{ id: string }> {
  const { viewer, admin } = await staffCheck(assignmentId);
  return suggestGradeForStudent(admin, viewer, assignmentId, studentId);
}

async function suggestGradeForStudent(
  admin: ReturnType<typeof createAdminClient>,
  viewer: { id: string; profile: { role: string }; permissions: string[] },
  assignmentId: string,
  studentId: string
): Promise<{ id: string }> {
  const { aiConfig, suggestGrade, logAI } = await import("@/lib/ai");
  const { checkAIGate } = await import("@/lib/plan-gate");
  const cfg = aiConfig();
  if ("error" in cfg) throw new Error(cfg.error);
  await checkAIGate(admin, viewer as never, "grade");
  const { data: asg } = await admin.from("assignments").select("id,class_id,title,max_points").eq("id", assignmentId).single();
  const a = asg as { id: string; class_id: string; title: string; max_points: number };
  const { data: cls } = await admin.from("classes").select("subject").eq("id", a.class_id).single();
  const { data: sub } = await admin.from("assignment_submissions").select("id,text_content").eq("assignment_id", assignmentId).eq("student_id", studentId).single();
  if (!sub) throw new Error("No submission from this student yet.");
  const s = sub as { id: string; text_content: string };
  const { data: files } = await admin.from("submission_files").select("name").eq("submission_id", s.id);
  const { data, prompt_tokens, completion_tokens } = await suggestGrade(cfg, {
    subject: ((cls as { subject?: string } | null)?.subject) ?? "",
    title: a.title, max_points: a.max_points,
    answer: (s.text_content ?? "").slice(0, 8000),
    files: ((files ?? []) as { name: string }[]).map((f) => f.name),
  });
  const d = data as { suggested_score?: number; suggested_feedback?: string; criteria?: string; confidence?: string };
  const score = Math.min(Math.max(Number(d.suggested_score) || 0, 0), a.max_points);
  const { data: sug, error } = await admin.from("ai_grading_suggestions").insert({
    assignment_id: assignmentId, student_id: studentId, submission_id: s.id,
    suggested_score: Math.round(score * 100) / 100,
    suggested_feedback: String(d.suggested_feedback ?? "").slice(0, 2000),
    criteria: String(d.criteria ?? "").slice(0, 2000),
    confidence: ["low", "medium", "high"].includes(d.confidence ?? "") ? d.confidence : "medium",
  }).select("id").single();
  if (error || !sug) throw new Error("Something went wrong. Please try again.");
  await logAI(admin, { user_id: viewer.id, kind: "grade", provider: cfg.provider, model: cfg.model, prompt_tokens, completion_tokens });
  return { id: (sug as { id: string }).id };
}

export async function resolveSuggestionAction(suggestionId: string, input: { decision: string; score?: number; feedback?: string }): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: sug } = await admin.from("ai_grading_suggestions").select("*").eq("id", suggestionId).single();
  if (!sug) throw new Error("Suggestion not found.");
  const s = sug as { status: string; assignment_id: string; student_id: string; suggested_score: number; suggested_feedback: string };
  if (s.status !== "pending") throw new Error(`Suggestion is already ${s.status}.`);
  // Reuse staff gate via save path: verify through assignment check inline
  const { data: asg } = await admin.from("assignments").select("id,class_id,max_points").eq("id", s.assignment_id).single();
  const a = asg as { id: string; class_id: string; max_points: number };
  const { data: cls } = await admin.from("classes").select("teacher_id").eq("id", a.class_id).single();
  const c = cls as { teacher_id: string } | null;
  const { data: member } = await admin.from("class_members").select("role_in_class").eq("class_id", a.class_id).eq("user_id", viewer.id).eq("status", "active").single();
  const m = member as { role_in_class: string } | null;
  const staff = isAdmin(viewer) || c?.teacher_id === viewer.id || (!!m && (m.role_in_class === "teacher" || m.role_in_class === "assistant"));
  if (!staff || (!can(viewer, "assignment.grade") && !isAdmin(viewer) && c?.teacher_id !== viewer.id)) {
    throw new Error("You do not have permission to grade.");
  }
  if (!["approve", "modify", "reject"].includes(input.decision)) throw new Error("Invalid decision.");
  if (input.decision === "reject") {
    await admin.from("ai_grading_suggestions").update({ status: "rejected", resolved_by: viewer.id, resolved_at: new Date().toISOString() }).eq("id", suggestionId);
    await logActivity(admin, viewer, "ai.suggestion_reject", "assignment", a.id, { suggestion_id: suggestionId });
    revalidatePath(`/dashboard/assignments/${a.id}`);
    return;
  }
  let final: { score: number; feedback: string };
  let source: string;
  if (input.decision === "approve") {
    final = { score: s.suggested_score, feedback: s.suggested_feedback };
    source = "ai_approved";
  } else {
    const num = Number(input.score);
    if (!Number.isFinite(num) || num < 0 || num > a.max_points) throw new Error(`Score must be 0–${a.max_points}.`);
    if ((input.feedback ?? "").length > 2000) throw new Error("Feedback is too long.");
    final = { score: Math.round(num * 100) / 100, feedback: (input.feedback ?? "").trim() };
    source = "ai_modified";
  }
  await admin.from("grades").upsert({
    assignment_id: a.id, student_id: s.student_id, score: final.score, max_points: a.max_points,
    feedback: final.feedback, graded_by: viewer.id, grading_source: source,
  }, { onConflict: "assignment_id,student_id" });
  await admin.from("assignment_submissions").update({ status: "graded" }).eq("assignment_id", a.id).eq("student_id", s.student_id);
  await admin.from("ai_grading_suggestions").update({ status: input.decision === "approve" ? "approved" : "modified", resolved_by: viewer.id, resolved_at: new Date().toISOString() }).eq("id", suggestionId);
  await logActivity(admin, viewer, "grade.change", "assignment", a.id, { student_id: s.student_id, source });
  revalidatePath(`/dashboard/assignments/${a.id}`);
}
