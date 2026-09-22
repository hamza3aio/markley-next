"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassAccess } from "@/lib/classes";
import { PURPOSE, validateFile, objectExists } from "@/lib/files";
import { logActivity } from "@/lib/activity";

export async function createAssignmentAction(classId: string, _prev: string | null, form: FormData): Promise<string | null> {
  const viewer = await requireViewer();
  if (!can(viewer, "assignment.create") && !isAdmin(viewer)) {
    return "You do not have permission to create assignments.";
  }
  const admin = createAdminClient();
  const access = await getClassAccess(admin, viewer, classId);
  if (!access) return "Class not found.";
  const member = access.member;
  const staff = isAdmin(viewer) || access.cls.teacher_id === viewer.id ||
    (!!member && (member.role_in_class === "teacher" || member.role_in_class === "assistant"));
  if (!staff) return "Only class staff can create assignments.";

  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim().slice(0, 5000);
  const instructions = String(form.get("instructions") ?? "").trim().slice(0, 5000);
  const type = String(form.get("type") ?? "normal");
  const status = String(form.get("status") ?? "published");
  const dueRaw = String(form.get("due_date") ?? "");
  const allowLate = String(form.get("allow_late") ?? "no") === "yes";
  const points = Number(form.get("max_points") ?? 100);
  if (title.length < 3 || title.length > 200) return "Title must be 3-200 characters.";
  if (!["guided", "normal"].includes(type)) return "Invalid type.";
  if (!["draft", "published"].includes(status)) return "Invalid status.";
  let due: string | null = null;
  if (dueRaw) {
    const d = new Date(dueRaw);
    if (Number.isNaN(d.getTime())) return "Invalid due date.";
    due = d.toISOString();
  }
  if (!Number.isInteger(points) || points < 1 || points > 1000) return "Points must be 1-1000.";

  const { data, error } = await admin.from("assignments").insert({
    class_id: classId, title, description, instructions, type, status,
    due_date: due, allow_late: allowLate, max_points: points, created_by: viewer.id,
  }).select("id").single();
  if (error || !data) return "Something went wrong. Please try again.";
  await logActivity(admin, viewer, "assignment.create", "class", classId, { assignment_id: data.id, title });
  redirect(`/dashboard/assignments/${data.id as string}`);
}

export async function deleteAssignmentAction(assignmentId: string, classId: string): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: asg } = await admin.from("assignments").select("id,class_id").eq("id", assignmentId).single();
  if (!asg) throw new Error("Assignment not found.");
  const access = await getClassAccess(admin, viewer, asg.class_id as string);
  if (!access) throw new Error("Assignment not found.");
  if (!isAdmin(viewer) && access.cls.teacher_id !== viewer.id) {
    throw new Error("You do not have permission to delete this assignment.");
  }
  await admin.from("assignments").update({ deleted_at: new Date().toISOString() }).eq("id", assignmentId);
  await logActivity(admin, viewer, "assignment.delete", "assignment", assignmentId, {});
  redirect(`/dashboard/classes/${classId}`);
}

export async function confirmAttachmentAction(
  assignmentId: string,
  input: { path: string; name: string; mime: string; size: number }
): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: asg } = await admin.from("assignments").select("id,class_id").eq("id", assignmentId).is("deleted_at", null).single();
  if (!asg) throw new Error("Assignment not found.");
  const access = await getClassAccess(admin, viewer, asg.class_id as string);
  if (!access) throw new Error("Assignment not found.");
  if (!isAdmin(viewer) && access.cls.teacher_id !== viewer.id) {
    throw new Error("Only the class teacher can attach files.");
  }
  const err = validateFile("assignment", input.name, input.mime, input.size);
  if (err) throw new Error(err);
  if (!input.path.startsWith(`class/${asg.class_id as string}/assignments/${assignmentId}/`)) {
    throw new Error("Invalid upload path.");
  }
  if (!(await objectExists(admin, PURPOSE.assignment.bucket, input.path))) {
    throw new Error("Upload not found. Please upload the file first.");
  }
  const { error } = await admin.from("assignment_attachments").insert({
    assignment_id: assignmentId, name: input.name.trim(), mime: input.mime, size_bytes: input.size, storage_path: input.path,
  });
  if (error) throw new Error("Something went wrong. Please try again.");
  revalidatePath(`/dashboard/assignments/${assignmentId}`);
}

export interface SubmitFile {
  path: string;
  name: string;
  mime: string;
  size: number;
}

export async function submitAssignmentAction(
  assignmentId: string,
  input: { text_content: string; files: SubmitFile[] }
): Promise<{ status: string }> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: asg } = await admin.from("assignments").select("*").eq("id", assignmentId).is("deleted_at", null).single();
  if (!asg) throw new Error("Assignment not found.");
  const access = await getClassAccess(admin, viewer, asg.class_id as string);
  const member = access?.member;
  if (!member || member.role_in_class !== "student") throw new Error("Only enrolled students can submit.");
  if (asg.status !== "published") throw new Error("Assignment is not open for submissions.");
  const late = !!(asg.due_date && new Date(asg.due_date as string).getTime() < Date.now());
  if (late && !asg.allow_late) throw new Error("The due date has passed.");

  const text = (input.text_content ?? "").slice(0, 20000);
  const files = Array.isArray(input.files) ? input.files.slice(0, 10) : [];
  if (asg.type === "guided" && !text.trim()) throw new Error("Guided assignments require a written answer.");
  if (asg.type === "normal" && !files.length) throw new Error("Please attach at least one file.");
  const prefix = `class/${asg.class_id as string}/submissions/${assignmentId}/`;
  for (const f of files) {
    const err = validateFile("submission", f.name, f.mime, f.size);
    if (err) throw new Error(err);
    if (typeof f.path !== "string" || !f.path.startsWith(prefix)) throw new Error("Invalid file reference.");
    if (!(await objectExists(admin, PURPOSE.submission.bucket, f.path))) {
      throw new Error(`Upload not found: ${(f.name || "").slice(0, 60)}.`);
    }
  }

  const status = late ? "late" : "submitted";
  const { data: existing } = await admin.from("assignment_submissions").select("id").eq("assignment_id", assignmentId).eq("student_id", viewer.id).single();
  let subId: string;
  if (existing) {
    await admin.from("assignment_submissions").update({ text_content: text.trim(), status, submitted_at: new Date().toISOString() }).eq("id", existing.id as string);
    subId = existing.id as string;
    await admin.from("submission_files").delete().eq("submission_id", subId);
  } else {
    const { data, error } = await admin.from("assignment_submissions").insert({
      assignment_id: assignmentId, student_id: viewer.id, text_content: text.trim(), status,
    }).select("id").single();
    if (error || !data) throw new Error("Something went wrong. Please try again.");
    subId = data.id as string;
  }
  if (files.length) {
    await admin.from("submission_files").insert(files.map((f) => ({
      submission_id: subId, name: f.name.trim(), mime: f.mime, size_bytes: f.size, storage_path: f.path,
    })));
  }
  await logActivity(admin, viewer, "assignment.submit", "assignment", assignmentId, { files: files.length, late });
  // Auto-award assignment points (dedupe keeps resubmits single).
  const { data: rule } = await admin.from("point_rules").select("id,points").eq("class_id", asg.class_id as string).eq("code", "assignment_submit").eq("active", true).single();
  if (rule) {
    await admin.from("points").insert({
      class_id: asg.class_id, user_id: viewer.id, rule_id: rule.id, points: rule.points,
      reason: "assignment_submit", dedupe_key: `submit:${assignmentId}`,
    });
    await checkAchievements(admin, asg.class_id as string, viewer.id);
  }
  revalidatePath(`/dashboard/assignments/${assignmentId}`);
  return { status };
}

async function checkAchievements(admin: ReturnType<typeof createAdminClient>, classId: string, userId: string) {
  const grant = async (code: string, metadata: Record<string, unknown> = {}) => {
    const { error } = await admin.from("student_achievements").insert({ achievement_code: code, user_id: userId, class_id: classId, metadata });
    if (!error) {
      await admin.from("notifications").insert({
        user_id: userId, type: "achievement", title: "Achievement unlocked!",
        body: code.replace(/_/g, " "), link: `/dashboard/classes/${classId}`,
      });
    }
  };
  const { data: asgs } = await admin.from("assignments").select("id").eq("class_id", classId).is("deleted_at", null);
  const aids = (asgs ?? []).map((a) => a.id as string);
  if (aids.length) {
    const { count } = await admin.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("student_id", userId).in("assignment_id", aids);
    if ((count ?? 0) > 0) await grant("first_assignment");
  }
  const { data: pts } = await admin.from("points").select("points").eq("class_id", classId).eq("user_id", userId);
  const total = (pts ?? []).reduce((n, r) => n + Number(r.points), 0);
  if (total >= 100) await grant("points_100", { total });
  if (total >= 500) await grant("points_500", { total });
}
