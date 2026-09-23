import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function ActivityPage() {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const global = viewer.permissions.includes("activity.view_global");
  let q = admin.from("activity_logs")
    .select("id,action,target_type,target_id,metadata,created_at,actor_role")
    .order("created_at", { ascending: false })
    .limit(50);
  if (!global) q = q.eq("actor_id", viewer.id);
  const { data: logs } = await q;

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>{global ? "Activity log (global)" : "My activity"}</h2>
      {(logs ?? []).length ? (
        <div className="table-wrap"><table>
          <thead><tr><th>Time</th><th>Action</th><th>Role</th><th>Target</th></tr></thead>
          <tbody>
            {((logs ?? []) as { id: string; action: string; actor_role: string; target_type: string; created_at: string }[]).map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.created_at).toLocaleString()}</td>
                <td>{l.action}</td>
                <td>{l.actor_role ?? ""}</td>
                <td>{l.target_type ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : <div className="empty">No activity yet.</div>}
    </section>
  );
}
