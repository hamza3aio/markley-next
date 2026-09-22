"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassAccess } from "@/lib/classes";
import { getPlan, limitError } from "@/lib/plans";
import { notifyUsers, sendEmail, appLink } from "@/lib/email";
import { logActivity } from "@/lib/activity";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function createClassAction(_prev: string | null, form: FormData): Promise<string | null> {
  const viewer = await requireViewer();
  if (!can(viewer, "class.create")) return "You do not have permission to create classes.";
  const name = String(form.get("name") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();
  const description = String(form.get("description") ?? "").trim().slice(0, 2000);
  const teacherEmail = String(form.get("teacher_email") ?? "").trim().toLowerCase();
  if (name.length < 3 || name.length > 120) return "Class name must be 3-120 characters.";
  if (subject.length < 2 || subject.length > 80) return "Subject must be 2-80 characters.";

  const admin = createAdminClient();
  let teacherId = viewer.id;
  if (teacherEmail) {
    if (!isAdmin(viewer)) return "Only admin can assign another teacher.";
    if (!EMAIL_RE.test(teacherEmail)) return "Invalid teacher email.";
    const { data: t } = await admin.from("profiles").select("id,role,status").eq("email", teacherEmail).single();
    if (!t || t.role !== "teacher" || t.status !== "active") return "Teacher not found or not active.";
    teacherId = t.id as string;
  } else if (viewer.profile.role !== "teacher" && !isAdmin(viewer)) {
    return "Only teachers can own classes.";
  }

  // Plan gate against the owner.
  const { data: owner } = await admin.from("profiles").select("role").eq("id", teacherId).single();
  if (owner?.role !== "admin") {
    const { features } = await getPlan(admin, teacherId);
    const { count } = await admin.from("classes").select("id", { count: "exact", head: true }).eq("teacher_id", teacherId).is("deleted_at", null);
    if ((count ?? 0) >= (features["classes.max"] ?? 5)) return limitError("classes.max");
  }

  const { data: cls, error } = await admin.from("classes").insert({
    name, subject, description, teacher_id: teacherId, created_by: viewer.id,
  }).select("id").single();
  if (error || !cls) return "Something went wrong. Please try again.";
  await admin.from("class_members").insert({ class_id: cls.id, user_id: teacherId, role_in_class: "teacher", invited_by: viewer.id });
  const { DEFAULT_RULES } = await import("@/lib/points");
  await admin.from("point_rules").upsert(
    DEFAULT_RULES.map((r) => ({ ...r, class_id: cls.id as string, created_by: viewer.id })),
    { onConflict: "class_id,code", ignoreDuplicates: true }
  );
  await logActivity(admin, viewer, "class.create", "class", cls.id as string, { name });
  redirect(`/dashboard/classes/${cls.id as string}`);
}

export async function updateClassAction(classId: string, _prev: string | null, form: FormData): Promise<string | null> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const access = await getClassAccess(admin, viewer, classId);
  if (!access) return "Class not found.";
  const owner = access.cls.teacher_id === viewer.id;
  if (!isAdmin(viewer) && !(owner && can(viewer, "class.edit"))) {
    return "You do not have permission to edit this class.";
  }
  const name = String(form.get("name") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();
  const description = String(form.get("description") ?? "").trim().slice(0, 2000);
  if (name.length < 3 || name.length > 120) return "Class name must be 3-120 characters.";
  if (subject.length < 2 || subject.length > 80) return "Subject must be 2-80 characters.";
  const { error } = await admin.from("classes").update({ name, subject, description }).eq("id", classId);
  if (error) return "Something went wrong. Please try again.";
  await logActivity(admin, viewer, "class.update", "class", classId, {});
  redirect(`/dashboard/classes/${classId}`);
}

export async function deleteClassAction(classId: string, _form?: FormData): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const access = await getClassAccess(admin, viewer, classId);
  if (!access) throw new Error("Class not found.");
  const owner = access.cls.teacher_id === viewer.id;
  if (!isAdmin(viewer) && !(owner && can(viewer, "class.delete"))) {
    throw new Error("You do not have permission to delete this class.");
  }
  await admin.from("classes").update({ deleted_at: new Date().toISOString() }).eq("id", classId);
  await logActivity(admin, viewer, "class.delete", "class", classId, {});
  redirect("/dashboard/classes");
}

export interface InviteState {
  error?: string;
  link?: string;
}

export async function inviteAction(classId: string, _prev: InviteState, form: FormData): Promise<InviteState> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const access = await getClassAccess(admin, viewer, classId);
  if (!access) return { error: "Class not found." };
  const member = access.member;
  const owner = access.cls.teacher_id === viewer.id;
  const allowed =
    isAdmin(viewer) || owner ||
    (!!member && (member.role_in_class === "assistant" || member.role_in_class === "teacher") && can(viewer, "class.invite"));
  if (!allowed) return { error: "You do not have permission to invite to this class." };

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "");
  const days = Math.min(Math.max(parseInt(String(form.get("days") ?? "7"), 10) || 7, 1), 30);
  if (!EMAIL_RE.test(email) || email.length > 254) return { error: "Invalid email address." };
  if (role !== "assistant" && role !== "student") return { error: "Role must be assistant or student." };

  const { data: ownerProfile } = await admin.from("profiles").select("role").eq("id", access.cls.teacher_id).single();
  if (ownerProfile?.role !== "admin" && role === "student") {
    const { features } = await getPlan(admin, access.cls.teacher_id as string);
    const { count: inClass } = await admin.from("class_members").select("id", { count: "exact", head: true }).eq("class_id", classId).eq("role_in_class", "student").eq("status", "active");
    const { count: pending } = await admin.from("class_invitations").select("id", { count: "exact", head: true }).eq("class_id", classId).eq("role_in_class", "student").eq("status", "pending");
    const used = (inClass ?? 0) + (pending ?? 0);
    if (used >= (features["students_per_class.max"] ?? 50)) return { error: limitError("students_per_class.max") };
  }

  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).single();
  if (existing) {
    const { data: m } = await admin.from("class_members").select("id").eq("class_id", classId).eq("user_id", existing.id).eq("status", "active").single();
    if (m) return { error: "This user is already in the class." };
  }

  const token = randomBytes(32).toString("hex");
  const { error } = await admin.from("class_invitations").insert({
    class_id: classId, email, role_in_class: role, token, single_use: true,
    status: "pending", expires_at: new Date(Date.now() + days * 86400000).toISOString(), invited_by: viewer.id,
  });
  if (error) return { error: "Something went wrong. Please try again." };
  await logActivity(admin, viewer, "class.invite", "class", classId, { email, role });
  const link = appLink(`/invite?token=${token}`);
  if (existing) {
    await notifyUsers(admin, { user_ids: [existing.id as string], type: "invitation", title: `Class invitation: ${access.cls.name}`, body: `You were invited as ${role}.`, link });
    sendEmail(admin, [existing.id as string], `Class invitation: ${access.cls.name}`, `You are invited to ${access.cls.name}`, `<p>You were invited as <b>${role}</b>.</p>`, link).catch(() => {});
  }
  return { link };
}
