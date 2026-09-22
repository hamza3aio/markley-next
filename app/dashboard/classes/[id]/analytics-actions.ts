"use server";

import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnalytics as getAnalyticsLib } from "@/lib/analytics";

export async function getAnalytics(classId: string) {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  return getAnalyticsLib(admin, viewer, classId);
}
