import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export async function getPlan(admin: Admin, userId: string) {
  const { data: up } = await admin.from("user_plans").select("plan_id").eq("user_id", userId).single();
  let plan = null;
  if (up) {
    const { data } = await admin.from("plans").select("*").eq("id", up.plan_id).single();
    plan = data;
  }
  if (!plan) {
    const { data } = await admin.from("plans").select("*").eq("slug", "free").single();
    plan = data;
  }
  if (!plan) return { plan: null, features: {} as Record<string, number> };
  const { data: feats } = await admin.from("plan_features").select("*").eq("plan_id", plan.id);
  return { plan, features: Object.fromEntries((feats ?? []).map((f) => [f.feature_key as string, f.value as number])) };
}

export function limitError(feature: string): string {
  return `PLAN_LIMIT:${feature}:Your plan does not allow this. Contact sales for a custom plan.`;
}

export function parseLimitError(message: string): string {
  return message.startsWith("PLAN_LIMIT:") ? message.split(":").slice(2).join(":") : message;
}
