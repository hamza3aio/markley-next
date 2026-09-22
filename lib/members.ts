import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export async function activeMembership(admin: Admin, classId: string, userId: string) {
  const { data } = await admin
    .from("class_members")
    .select("id,role_in_class")
    .eq("class_id", classId)
    .eq("user_id", userId)
    .eq("status", "active")
    .single();
  return (data as { id: string; role_in_class: string } | null) ?? null;
}
