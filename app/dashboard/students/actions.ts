"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function linkParentAction(_prev: string | null, form: FormData): Promise<string | null> {
  const viewer = await requireViewer();
  if (!isAdmin(viewer) && !(viewer.profile.role === "teacher" && can(viewer, "class.invite"))) {
    return "You do not have permission to link parents.";
  }
  const parentEmail = String(form.get("parent_email") ?? "").trim().toLowerCase();
  const studentEmail = String(form.get("student_email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(parentEmail) || !EMAIL_RE.test(studentEmail)) {
    return "Valid parent and student emails are required.";
  }
  const admin = createAdminClient();
  const { data: parent } = await admin.from("profiles").select("id,role,status").eq("email", parentEmail).single();
  const { data: student } = await admin.from("profiles").select("id,role,status").eq("email", studentEmail).single();
  if (!parent || parent.role !== "parent" || parent.status !== "active") {
    return "Parent account not found or not active.";
  }
  if (!student || student.role !== "student" || student.status !== "active") {
    return "Student account not found or not active.";
  }
  const { error } = await admin.from("parent_student_links").upsert(
    { parent_id: parent.id, student_id: student.id, created_by: viewer.id, status: "active" },
    { onConflict: "parent_id,student_id" }
  );
  if (error) return "Something went wrong. Please try again.";
  await logActivity(admin, viewer, "parent.link", "student", student.id as string, { parent_id: parent.id });
  redirect("/dashboard/students");
}
