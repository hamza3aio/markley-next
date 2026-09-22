import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const TITLES: Record<string, string> = {
  admin: "Admin dashboard",
  teacher: "Teacher dashboard",
  assistant: "Assistant dashboard",
  student: "Student dashboard",
  parent: "Parent dashboard",
};

export default async function DashboardPage() {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: logs } = await admin
    .from("activity_logs")
    .select("action,created_at")
    .eq("actor_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <>
      <section className="card">
        <h1 style={{ margin: "0 0 4px" }}>{TITLES[viewer.profile.role] ?? "Dashboard"}</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          Signed in as {viewer.profile.email} · status <span className="badge success">{viewer.profile.status}</span>
        </p>
      </section>
      <section className="grid cols-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>My permissions (server-verified)</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {viewer.permissions.length
              ? viewer.permissions.map((p) => <span key={p} className="badge">{p}</span>)
              : <span style={{ color: "var(--muted)" }}>No extra permissions</span>}
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent activity</h3>
          {(logs ?? []).length ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              {(logs ?? []).map((l, i) => (
                <li key={i}>{l.action} · {new Date(l.created_at).toLocaleString()}</li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--muted)" }}>No activity yet.</p>
          )}
        </div>
      </section>
    </>
  );
}
