import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export type Role = "admin" | "teacher" | "assistant" | "student" | "parent";

export interface Viewer {
  id: string;
  email: string;
  profile: {
    id: string;
    email: string;
    full_name: string;
    role: Role;
    status: string;
    theme: { primary: string; secondary: string; mode: string };
    email_notifications: boolean;
  };
  permissions: string[];
}

export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!user.email_confirmed_at) return { unverified: true } as unknown as Viewer;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id,email,full_name,role,status,theme,email_notifications")
    .eq("id", user.id)
    .single();
  if (!profile || profile.status !== "active") return null;

  const { data: rows } = await admin
    .from("role_permissions")
    .select("permission")
    .eq("role", profile.role);
  return {
    id: user.id,
    email: user.email ?? profile.email,
    profile: profile as Viewer["profile"],
    permissions: (rows ?? []).map((r) => r.permission),
  };
}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer || (viewer as unknown as { unverified?: boolean }).unverified) {
    redirect("/login");
  }
  return viewer;
}
