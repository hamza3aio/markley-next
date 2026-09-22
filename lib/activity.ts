import { createAdminClient } from "@/lib/supabase/admin";
import type { Viewer } from "@/lib/auth";

type Admin = ReturnType<typeof createAdminClient>;

export async function logActivity(
  admin: Admin,
  viewer: Viewer,
  action: string,
  targetType: string | null,
  targetId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await admin.from("activity_logs").insert({
      actor_id: viewer.id,
      actor_role: viewer.profile.role,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
    });
  } catch {
    // Logging never breaks the request.
  }
}
