"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";

export async function acceptAction(token: string, _form?: FormData): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  if (typeof token !== "string" || token.length < 32) throw new Error("Invalid invitation.");

  const { data: invite } = await admin.from("class_invitations").select("*").eq("token", token.trim()).single();
  if (!invite) throw new Error("Invitation not found.");
  if (invite.status !== "pending") throw new Error(`Invitation is ${invite.status}.`);
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await admin.from("class_invitations").update({ status: "expired" }).eq("id", invite.id);
    throw new Error("Invitation has expired.");
  }
  if ((viewer.profile.email ?? "").toLowerCase() !== String(invite.email ?? "").toLowerCase()) {
    throw new Error("This invitation was sent to a different email address.");
  }
  if (viewer.profile.role !== invite.role_in_class) {
    throw new Error(`This invitation is for a ${invite.role_in_class} account.`);
  }
  const { data: cls } = await admin.from("classes").select("id").eq("id", invite.class_id).is("deleted_at", null).single();
  if (!cls) throw new Error("Class no longer exists.");

  const { data: existing } = await admin.from("class_members").select("id,status").eq("class_id", invite.class_id).eq("user_id", viewer.id).single();
  if (existing?.status === "active") {
    if (invite.single_use) {
      await admin.from("class_invitations").update({ status: "accepted", accepted_by: viewer.id, accepted_at: new Date().toISOString() }).eq("id", invite.id);
    }
  } else if (existing) {
    await admin.from("class_members").update({ status: "active", joined_at: new Date().toISOString() }).eq("id", existing.id);
    await admin.from("class_invitations").update({ status: "accepted", accepted_by: viewer.id, accepted_at: new Date().toISOString() }).eq("id", invite.id);
  } else {
    const { error } = await admin.from("class_members").insert({
      class_id: invite.class_id, user_id: viewer.id, role_in_class: invite.role_in_class, invited_by: invite.invited_by,
    });
    if (error) throw new Error("Something went wrong. Please try again.");
    await admin.from("class_invitations").update({ status: "accepted", accepted_by: viewer.id, accepted_at: new Date().toISOString() }).eq("id", invite.id);
  }
  await logActivity(admin, viewer, "invitation.accept", "class", invite.class_id as string, { invitation_id: invite.id });
  redirect(`/dashboard/classes/${invite.class_id as string}`);
}

export async function revokeAction(inviteId: string, _form?: FormData): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: invite } = await admin.from("class_invitations").select("*").eq("id", inviteId).single();
  if (!invite) throw new Error("Invitation not found.");
  const { data: cls } = await admin.from("classes").select("id,teacher_id").eq("id", invite.class_id).single();
  if (!isAdmin(viewer) && cls?.teacher_id !== viewer.id) {
    throw new Error("You do not have permission to revoke this invitation.");
  }
  if (invite.status !== "pending") throw new Error(`Invitation is already ${invite.status}.`);
  await admin.from("class_invitations").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", inviteId);
  await logActivity(admin, viewer, "invitation.revoke", "class", invite.class_id as string, { invitation_id: inviteId });
  redirect("/dashboard/invitations");
}
