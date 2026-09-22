"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { PURPOSE, validateFile, buildPath, signedUpload, objectExists, type Purpose } from "@/lib/files";
import { logActivity } from "@/lib/activity";

const SESSIONS = ["Feb/March", "May/June", "Oct/Nov"];

function manager(viewer: { profile: { role: string }; permissions: string[] }) {
  if (!isAdmin(viewer as never) && !can(viewer as never, "exams.manage")) {
    throw new Error("You do not have permission to manage exams.");
  }
}

export async function getExamMeta() {
  const admin = createAdminClient();
  const [{ data: boards }, { data: subjects }] = await Promise.all([
    admin.from("exam_boards").select("*").order("name"),
    admin.from("subjects").select("*").order("name"),
  ]);
  return { boards: (boards ?? []) as { code: string; name: string }[], subjects: (subjects ?? []) as { code: string; name: string }[] };
}

export async function addMetaAction(kind: string, code: string, name: string): Promise<void> {
  const viewer = await requireViewer();
  manager(viewer);
  if (kind !== "board" && kind !== "subject") throw new Error("Invalid request.");
  if (!/^[a-z0-9_]{2,30}$/.test(code.trim())) throw new Error("Code must be 2-30 lowercase letters, numbers or _.");
  if (name.trim().length < 2 || name.trim().length > 80) throw new Error("Name must be 2-80 characters.");
  const admin = createAdminClient();
  const { error } = await admin.from(kind === "board" ? "exam_boards" : "subjects").insert({ code: code.trim(), name: name.trim() });
  if (error) throw new Error("This code already exists.");
  revalidatePath("/dashboard/exams");
}

export async function createExamAction(input: { subject_code: string; board_code: string; year: number; session: string; paper: string; title: string }): Promise<string> {
  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  const { data: subj } = await admin.from("subjects").select("code").eq("code", input.subject_code).single();
  if (!subj) throw new Error("Invalid subject.");
  const { data: brd } = await admin.from("exam_boards").select("code").eq("code", input.board_code).single();
  if (!brd) throw new Error("Invalid exam board.");
  if (!Number.isInteger(input.year) || input.year < 1990 || input.year > 2100) throw new Error("Invalid year.");
  if (!SESSIONS.includes(input.session)) throw new Error("Invalid session.");
  if (!input.paper.trim() || input.paper.trim().length > 60) throw new Error("Paper is required (max 60 chars).");
  if (input.title.length > 200) throw new Error("Title is too long.");
  const { data, error } = await admin.from("exams").insert({
    subject_code: input.subject_code, board_code: input.board_code, year: input.year,
    session: input.session, paper: input.paper.trim(), title: input.title.trim(), created_by: viewer.id,
  }).select("id").single();
  if (error || !data) throw new Error("Something went wrong. Please try again.");
  await logActivity(admin, viewer, "exam.create", "exam", (data as { id: string }).id, { subject_code: input.subject_code });
  revalidatePath("/dashboard/exams");
  return (data as { id: string }).id;
}

export async function updateExamAction(examId: string, input: { subject_code: string; board_code: string; year: number; session: string; paper: string; title: string }): Promise<void> {
  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  await admin.from("exams").update({
    subject_code: input.subject_code, board_code: input.board_code, year: input.year,
    session: input.session, paper: input.paper.trim(), title: input.title.trim(),
  }).eq("id", examId);
  await logActivity(admin, viewer, "exam.update", "exam", examId, {});
  revalidatePath(`/dashboard/exams/${examId}`);
}

export async function deleteExamAction(examId: string): Promise<void> {
  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  const { data: exam } = await admin.from("exams").select("question_path,markscheme_path").eq("id", examId).single();
  const { data: resources } = await admin.from("exam_resources").select("storage_path").eq("exam_id", examId);
  const paths = [...((resources ?? []) as { storage_path: string }[]).map((r) => r.storage_path), (exam as { question_path?: string } | null)?.question_path, (exam as { markscheme_path?: string } | null)?.markscheme_path].filter(Boolean) as string[];
  if (paths.length) await admin.storage.from(PURPOSE.exam_question.bucket).remove(paths);
  await admin.from("exams").delete().eq("id", examId);
  await logActivity(admin, viewer, "exam.delete", "exam", examId, {});
  redirect("/dashboard/exams");
}

export async function examUploadUrlAction(
  examId: string, kind: "question" | "markscheme" | "resource", input: { name: string; mime: string; size: number }
): Promise<{ bucket: string; path: string; signedUrl: string; token: string }> {
  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  const { data: exam } = await admin.from("exams").select("id").eq("id", examId).single();
  if (!exam) throw new Error("Exam not found.");
  const purpose: Purpose = kind === "resource" ? "exam_resource" : "exam_question";
  const err = validateFile(purpose, input.name, input.mime, input.size);
  if (err) throw new Error(err);
  const path = buildPath(`exams/${examId}/${kind}`, input.name);
  const up = await signedUpload(admin, PURPOSE[purpose].bucket, path);
  return { bucket: PURPOSE[purpose].bucket, ...up };
}

export async function confirmExamFileAction(examId: string, kind: "question" | "markscheme", input: { path: string; name: string }): Promise<void> {
  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  if (!input.path.startsWith(`exams/${examId}/`)) throw new Error("Invalid file reference.");
  if (!(await objectExists(admin, PURPOSE.exam_question.bucket, input.path))) {
    throw new Error("Upload not found. Please upload the file first.");
  }
  const field = kind === "question" ? "question_path" : "markscheme_path";
  const nameField = kind === "question" ? "question_name" : "markscheme_name";
  await admin.from("exams").update({ [field]: input.path, [nameField]: input.name.trim().slice(0, 255) }).eq("id", examId);
  await logActivity(admin, viewer, kind === "markscheme" ? "markscheme.change" : "exam.update", "exam", examId, {});
  revalidatePath(`/dashboard/exams/${examId}`);
}

export async function addExamResourceAction(examId: string, input: { path: string; label: string; name: string; mime: string; size: number }): Promise<void> {
  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  const err = validateFile("exam_resource", input.name, input.mime, input.size);
  if (err) throw new Error(err);
  if (!input.path.startsWith(`exams/${examId}/resource/`)) throw new Error("Invalid upload path.");
  if (!input.label.trim() || input.label.trim().length > 120) throw new Error("Label is required (max 120 chars).");
  if (!(await objectExists(admin, PURPOSE.exam_resource.bucket, input.path))) {
    throw new Error("Upload not found. Please upload the file first.");
  }
  await admin.from("exam_resources").insert({
    exam_id: examId, label: input.label.trim(), name: input.name.trim(),
    mime: input.mime, size_bytes: input.size, storage_path: input.path,
  });
  revalidatePath(`/dashboard/exams/${examId}`);
}

export async function deleteExamResourceAction(examId: string, resourceId: string): Promise<void> {
  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  const { data: r } = await admin.from("exam_resources").select("*").eq("id", resourceId).eq("exam_id", examId).single();
  if (!r) throw new Error("Resource not found.");
  await admin.storage.from(PURPOSE.exam_resource.bucket).remove([(r as { storage_path: string }).storage_path]);
  await admin.from("exam_resources").delete().eq("id", resourceId);
  revalidatePath(`/dashboard/exams/${examId}`);
}
