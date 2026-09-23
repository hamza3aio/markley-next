"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan } from "@/lib/plans";
import { PLAN_LIMITS, PLAN_FLAGS } from "@/lib/plan-flags";
import { logActivity } from "@/lib/activity";

function manager(viewer: { profile: { role: string }; permissions: string[] }) {
  if (!isAdmin(viewer as never) && !can(viewer as never, "plans.manage")) {
    throw new Error("You do not have permission to manage plans.");
  }
}

export async function getPlansAction() {
  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  const { data: plans } = await admin.from("plans").select("*").order("price_monthly", { ascending: true, nullsFirst: false });
  const { data: feats } = await admin.from("plan_features").select("*");
  const byPlan: Record<string, Record<string, number>> = {};
  ((feats ?? []) as { plan_id: string; feature_key: string; value: number }[]).forEach((f) => {
    (byPlan[f.plan_id] = byPlan[f.plan_id] || {})[f.feature_key] = f.value;
  });
  return ((plans ?? []) as { id: string; name: string; slug: string; description: string; price_monthly: number | null; is_active: boolean; is_default: boolean }[]).map((p) => ({ ...p, features: byPlan[p.id] ?? {} }));
}

export async function createPlanAction(input: { name: string; slug: string; price: string }): Promise<void> {
  const viewer = await requireViewer();
  manager(viewer);
  if (input.name.trim().length < 2 || input.name.trim().length > 80) throw new Error("Name must be 2-80 characters.");
  if (!/^[a-z0-9_]{2,40}$/.test(input.slug.trim())) throw new Error("Slug must be 2-40 lowercase letters, numbers or _.");
  const price = input.price === "" ? null : Number(input.price);
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error("Invalid price.");
  const admin = createAdminClient();
  const { data, error } = await admin.from("plans").insert({
    name: input.name.trim(), slug: input.slug.trim(), price_monthly: price, is_active: true,
  }).select("id").single();
  if (error || !data) throw new Error("A plan with this slug already exists.");
  const { data: freeId } = await admin.from("plans").select("id").eq("slug", "free").single();
  if (freeId) {
    const { data: freeFeats } = await admin.from("plan_features").select("feature_key,value").eq("plan_id", (freeId as { id: string }).id);
    if (freeFeats?.length) {
      await admin.from("plan_features").insert(
        ((freeFeats ?? []) as { feature_key: string; value: number }[]).map((f) => ({ plan_id: (data as { id: string }).id, feature_key: f.feature_key, value: f.value }))
      );
    }
  }
  await logActivity(admin, viewer, "plan.change", "plan", (data as { id: string }).id, { slug: input.slug });
  revalidatePath("/dashboard/plans");
}

export async function savePlanAction(planId: string, input: { price: string; active: boolean; features: Record<string, number> }): Promise<void> {
  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  const { data: plan } = await admin.from("plans").select("is_default").eq("id", planId).single();
  if (!plan) throw new Error("Plan not found.");
  if ((plan as { is_default: boolean }).is_default && !input.active) throw new Error("The default plan cannot be deactivated.");
  const price = input.price === "" ? null : Number(input.price);
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error("Invalid price.");
  await admin.from("plans").update({ price_monthly: price, is_active: input.active }).eq("id", planId);
  const KNOWN = [...PLAN_LIMITS, ...PLAN_FLAGS];
  const rows = Object.entries(input.features)
    .filter(([k]) => KNOWN.includes(k))
    .map(([feature_key, value]) => ({ plan_id: planId, feature_key, value: Math.max(0, Math.floor(value)) }));
  if (rows.length) await admin.from("plan_features").upsert(rows, { onConflict: "plan_id,feature_key" });
  await logActivity(admin, viewer, "plan.change", "plan", planId, {});
  revalidatePath("/dashboard/plans");
}

export async function deletePlanAction(planId: string): Promise<{ deactivated: boolean }> {
  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  const { data: plan } = await admin.from("plans").select("is_default").eq("id", planId).single();
  if (!plan) throw new Error("Plan not found.");
  if ((plan as { is_default: boolean }).is_default) throw new Error("The default plan cannot be deleted.");
  const { count } = await admin.from("user_plans").select("user_id", { count: "exact", head: true }).eq("plan_id", planId);
  if ((count ?? 0) > 0) {
    await admin.from("plans").update({ is_active: false }).eq("id", planId);
    revalidatePath("/dashboard/plans");
    return { deactivated: true };
  }
  await admin.from("plans").delete().eq("id", planId);
  revalidatePath("/dashboard/plans");
  return { deactivated: false };
}

export async function assignPlanAction(userEmail: string, planSlug: string): Promise<void> {
  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id,role,status").eq("email", userEmail.trim().toLowerCase()).single();
  if (!target || (target as { status: string }).status !== "active") throw new Error("User not found or not active.");
  const t = target as { id: string; role: string };
  const { data: plan } = await admin.from("plans").select("id,price_monthly,slug").eq("slug", planSlug.trim()).eq("is_active", true).single();
  if (!plan) throw new Error("Plan not found or inactive.");
  const p = plan as { id: string; price_monthly: number | null };
  if ((t.role === "student" || t.role === "parent") && (p.price_monthly || 0) > 0) {
    throw new Error("Students and parents are never charged.");
  }
  if (t.role === "student" || t.role === "parent") {
    throw new Error("Students and parents use the free plan automatically.");
  }
  await admin.from("user_plans").upsert({ user_id: t.id, plan_id: p.id, assigned_by: viewer.id }, { onConflict: "user_id" });
  await logActivity(admin, viewer, "plan.assign", "user", t.id, { plan: planSlug });
  revalidatePath("/dashboard/plans");
}

export async function getRequestsAction() {  const viewer = await requireViewer();
  manager(viewer);
  const admin = createAdminClient();
  const { data } = await admin.from("plan_requests").select("*").order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as { id: string; name: string; email: string; organization: string; message: string; status: string }[];
}

export async function setRequestStatusAction(requestId: string, status: string): Promise<void> {
  const viewer = await requireViewer();
  manager(viewer);
  if (!["pending", "contacted", "closed"].includes(status)) throw new Error("Invalid status.");
  const admin = createAdminClient();
  await admin.from("plan_requests").update({ status }).eq("id", requestId);
  revalidatePath("/dashboard/plans");
}

export async function getMyPlanAction() {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { plan, features } = await getPlan(admin, viewer.id);
  const { count: classes } = await admin.from("classes").select("id", { count: "exact", head: true }).eq("teacher_id", viewer.id).is("deleted_at", null);
  let bytes = 0;
  const { data: f1 } = await admin.from("files").select("size_bytes").eq("uploaded_by", viewer.id);
  ((f1 ?? []) as { size_bytes: number }[]).forEach((f) => { bytes += Number(f.size_bytes) || 0; });
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count: ai } = await admin.from("ai_requests").select("id", { count: "exact", head: true }).eq("user_id", viewer.id).gte("created_at", monthStart.toISOString());
  return {
    plan: plan ? { name: (plan as { name: string }).name, slug: (plan as { slug: string }).slug } : null,
    features,
    used: { classes: classes ?? 0, storage_mb: Math.round((bytes / 1048576) * 10) / 10, ai_monthly: ai ?? 0 },
  };
}

export async function requestPlanAction(input: { name: string; email: string; organization: string; message: string }): Promise<void> {
  const viewer = await requireViewer();
  if (!["teacher", "admin", "assistant"].includes(viewer.profile.role)) {
    throw new Error("Custom plans are for teachers and schools.");
  }
  if (input.name.trim().length < 2 || input.name.trim().length > 120) throw new Error("Name must be 2-120 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.email)) throw new Error("Invalid email address.");
  if (input.organization.length > 200) throw new Error("Organization is too long.");
  if (input.message.trim().length < 10 || input.message.trim().length > 3000) throw new Error("Message must be 10-3000 characters.");
  const admin = createAdminClient();
  const { count } = await admin.from("plan_requests").select("id", { count: "exact", head: true }).eq("created_by", viewer.id).eq("status", "pending");
  if ((count ?? 0) >= 3) throw new Error("You already have open requests. Please wait for a reply.");
  await admin.from("plan_requests").insert({
    created_by: viewer.id, name: input.name.trim(), email: input.email.trim().toLowerCase(),
    organization: input.organization.trim(), message: input.message.trim(),
  });
  revalidatePath("/dashboard/plan");
}
