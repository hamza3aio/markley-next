"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassAccess } from "@/lib/classes";
import { PURPOSE, validateFile, buildPath, signedUpload, signedDownload, objectExists, type Purpose } from "@/lib/files";
import { getPlan, limitError } from "@/lib/plans";
import { logActivity } from "@/lib/activity";

async function storageUsedMb(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
  let bytes = 0;
  const { data: f1 } = await admin.from("files").select("size_bytes").eq("uploaded_by", userId);
  (f1 ?? []).forEach((f) => { bytes += Number(f.size_bytes) || 0; });
  const { data: subs } = await admin.from("assignment_submissions").select("id").eq("student_id", userId);
  if (subs?.length) {
    const { data: sf } = await admin.from("submission_files").select("size_bytes").in("submission_id", subs.map((s) => s.id as string));
    (sf ?? []).forEach((f) => { bytes += Number(f.size_bytes) || 0; });
  }
  const { data: mine } = await admin.from("assignments").select("id").eq("created_by", userId).is("deleted_at", null);
  if (mine?.length) {
    const { data: af } = await admin.from("assignment_attachments").select("size_bytes").in("assignment_id", mine.map((a) => a.id as string));
    (af ?? []).forEach((f) => { bytes += Number(f.size_bytes) || 0; });
  }
  return bytes / 1048576;
}

export async function getUploadUrlAction(
  classId: string,
  assignmentId: string | null,
  input: { purpose: Purpose; name: string; mime: string; size: number }
): Promise<{ bucket: string; path: string; signedUrl: string; token: string }> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { purpose, name, mime, size } = input;
  if (!PURPOSE[purpose]) throw new Error("Invalid upload purpose.");
  const access = await getClassAccess(admin, viewer, classId);
  if (!access) throw new Error("Class not found.");
  const member = access.member;
  if (!member && !isAdmin(viewer)) throw new Error("You do not have access to this class.");

  const err = validateFile(purpose, name, mime, size);
  if (err) throw new Error(err);

  if (!isAdmin(viewer)) {
    const { features } = await getPlan(admin, viewer.id);
    const usedMb = await storageUsedMb(admin, viewer.id);
    const limitMb = features["storage_mb.max"] ?? 1024;
    if (usedMb + size / 1048576 > limitMb) throw new Error(limitError("storage_mb.max"));
  }

  if (purpose === "content") {
    const ok =
      isAdmin(viewer) || access.cls.teacher_id === viewer.id ||
      (!!member && (member.role_in_class === "assistant" || member.role_in_class === "teacher") && can(viewer, "content.upload"));
    if (!ok) throw new Error("You do not have permission to upload content.");
    const path = buildPath(`class/${classId}/content`, name);
    const up = await signedUpload(admin, PURPOSE.content.bucket, path);
    return { bucket: PURPOSE.content.bucket, ...up };
  }

  if (!assignmentId) throw new Error("Invalid request.");
  const { data: asg } = await admin.from("assignments").select("id,class_id,status,due_date,allow_late").eq("id", assignmentId).is("deleted_at", null).single();
  if (!asg || asg.class_id !== classId) throw new Error("Assignment not found.");

  if (purpose === "assignment") {
    if (!isAdmin(viewer) && access.cls.teacher_id !== viewer.id) {
      throw new Error("Only the class teacher can attach files.");
    }
    const path = buildPath(`class/${classId}/assignments/${assignmentId}`, name);
    const up = await signedUpload(admin, PURPOSE.assignment.bucket, path);
    return { bucket: PURPOSE.assignment.bucket, ...up };
  }

  if (!member || member.role_in_class !== "student") throw new Error("Only enrolled students can submit.");
  if (asg.status !== "published") throw new Error("Assignment is not open for submissions.");
  if (asg.due_date && new Date(asg.due_date).getTime() < Date.now() && !asg.allow_late) {
    throw new Error("The due date has passed.");
  }
  const path = buildPath(`class/${classId}/submissions/${assignmentId}`, name);
  const up = await signedUpload(admin, PURPOSE.submission.bucket, path);
  return { bucket: PURPOSE.submission.bucket, ...up };
}

export async function confirmContentFileAction(
  classId: string,
  input: { path: string; name: string; mime: string; size: number; description?: string; visibility?: string }
): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const access = await getClassAccess(admin, viewer, classId);
  if (!access) throw new Error("Class not found.");
  const member = access.member;
  const ok =
    isAdmin(viewer) || access.cls.teacher_id === viewer.id ||
    (!!member && (member.role_in_class === "assistant" || member.role_in_class === "teacher") && can(viewer, "content.upload"));
  if (!ok) throw new Error("You do not have permission to upload content.");
  const err = validateFile("content", input.name, input.mime, input.size);
  if (err) throw new Error(err);
  if (!input.path.startsWith(`class/${classId}/content/`)) throw new Error("Invalid upload path.");
  if (!(await objectExists(admin, PURPOSE.content.bucket, input.path))) {
    throw new Error("Upload not found. Please upload the file first.");
  }
  const visibility = input.visibility === "teachers" ? "teachers" : "class";
  const { error } = await admin.from("files").insert({
    class_id: classId, uploaded_by: viewer.id, name: input.name.trim(),
    description: (input.description ?? "").trim().slice(0, 1000),
    mime: input.mime, size_bytes: input.size, storage_path: input.path, visibility,
  });
  if (error) throw new Error("Something went wrong. Please try again.");
  await logActivity(admin, viewer, "file.upload", "class", classId, { name: input.name });
  revalidatePath(`/dashboard/classes/${classId}`);
}

export async function renameFileAction(fileId: string, name: string): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: f } = await admin.from("files").select("*").eq("id", fileId).single();
  if (!f) throw new Error("File not found.");
  const access = await getClassAccess(admin, viewer, f.class_id as string);
  if (!access) throw new Error("File not found.");
  const member = access.member;
  const manager =
    isAdmin(viewer) || access.cls.teacher_id === viewer.id || f.uploaded_by === viewer.id ||
    (!!member && member.role_in_class === "assistant" && can(viewer, "content.upload"));
  if (!manager) throw new Error("You do not have permission to manage this file.");
  if (!name.trim() || name.trim().length > 255) throw new Error("Invalid file name.");
  await admin.from("files").update({ name: name.trim() }).eq("id", fileId);
  revalidatePath(`/dashboard/classes/${f.class_id as string}`);
}

export async function deleteFileAction(fileId: string): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: f } = await admin.from("files").select("*").eq("id", fileId).single();
  if (!f) throw new Error("File not found.");
  const access = await getClassAccess(admin, viewer, f.class_id as string);
  if (!access) throw new Error("File not found.");
  const member = access.member;
  const manager =
    isAdmin(viewer) || access.cls.teacher_id === viewer.id || f.uploaded_by === viewer.id ||
    (!!member && member.role_in_class === "assistant" && can(viewer, "content.upload"));
  if (!manager) throw new Error("You do not have permission to manage this file.");
  await admin.storage.from(PURPOSE.content.bucket).remove([f.storage_path as string]);
  await admin.from("files").delete().eq("id", fileId);
  await logActivity(admin, viewer, "file.delete", "class", f.class_id as string, { file_id: fileId });
  revalidatePath(`/dashboard/classes/${f.class_id as string}`);
}

export async function listContentFiles(classId: string, roleInClass: string | null, isParent: boolean): Promise<ContentFile[]> {
  const admin = createAdminClient();
  let q = admin.from("files").select("id,name,description,mime,size_bytes,storage_path,visibility,uploaded_by,created_at").eq("class_id", classId).order("created_at", { ascending: false }).limit(200);
  if (roleInClass === "student" || isParent) q = q.eq("visibility", "class");
  const { data } = await q;
  return await Promise.all(((data ?? []) as ContentRow[]).map(async (f) => ({
    id: f.id, name: f.name, description: f.description, mime: f.mime,
    size_bytes: f.size_bytes, visibility: f.visibility,
    downloadUrl: await signedDownload(admin, PURPOSE.content.bucket, f.storage_path),
  })));
}

interface ContentRow {
  id: string;
  name: string;
  description: string;
  mime: string;
  size_bytes: number;
  storage_path: string;
  visibility: string;
}

export interface ContentFile {
  id: string;
  name: string;
  description: string;
  mime: string;
  size_bytes: number;
  visibility: string;
  downloadUrl: string | null;
}
