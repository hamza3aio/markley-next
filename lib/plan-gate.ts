import { createAdminClient } from "@/lib/supabase/admin";
import type { Viewer } from "@/lib/auth";
import { getPlan } from "@/lib/plans";

type Admin = ReturnType<typeof createAdminClient>;

export async function checkAIGate(admin: Admin, viewer: Viewer, kind: string): Promise<void> {
  if (viewer.profile.role === "admin") return;
  const { features } = await getPlan(admin, viewer.id);
  if (!features["ai_tools"]) {
    throw new Error("AI tools are not enabled on your plan. Contact sales for a custom plan.");
  }
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count } = await admin.from("ai_requests").select("id", { count: "exact", head: true }).eq("user_id", viewer.id).gte("created_at", monthStart.toISOString());
  const limit = features["ai_monthly.max"] ?? 50;
  if ((count ?? 0) >= limit) {
    throw new Error(`Monthly AI limit reached (${limit}). Contact sales for a custom plan. [${kind}]`);
  }
}
