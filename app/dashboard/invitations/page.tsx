import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeAction } from "./actions";

export default async function InvitationsPage() {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const myEmail = viewer.profile.email.toLowerCase();

  const { data: mine } = await admin
    .from("class_invitations")
    .select("id,class_id,role_in_class,status,expires_at,created_at")
    .eq("email", myEmail)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());

  let sent: Record<string, unknown>[] = [];
  if (["teacher", "assistant", "admin"].includes(viewer.profile.role)) {
    let classIds: string[] = [];
    if (viewer.profile.role === "admin") {
      const { data: all } = await admin.from("classes").select("id").is("deleted_at", null).limit(500);
      classIds = (all ?? []).map((c) => c.id as string);
    } else {
      const { data: ms } = await admin.from("class_members").select("class_id").eq("user_id", viewer.id).eq("status", "active");
      classIds = [...new Set((ms ?? []).map((m) => m.class_id as string))];
    }
    if (classIds.length) {
      const { data } = await admin.from("class_invitations")
        .select("id,class_id,email,role_in_class,status,expires_at,created_at")
        .in("class_id", classIds).eq("status", "pending")
        .order("created_at", { ascending: false }).limit(200);
      sent = (data ?? []) as Record<string, unknown>[];
    }
  }

  const allIds = [...new Set([...(mine ?? []).map((i) => i.class_id as string), ...sent.map((i) => i.class_id as string)])];
  let names: Record<string, string> = {};
  if (allIds.length) {
    const { data: classes } = await admin.from("classes").select("id,name").in("id", allIds);
    names = Object.fromEntries((classes ?? []).map((c) => [c.id as string, c.name as string]));
  }

  return (
    <>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>Received</h2>
        {(mine ?? []).length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Class</th><th>Role</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {(mine ?? []).map((i) => (
                <tr key={i.id as string}>
                  <td>{names[i.class_id as string] ?? (i.class_id as string)}</td>
                  <td><span className="badge">{i.role_in_class as string}</span></td>
                  <td>{new Date(i.expires_at as string).toLocaleDateString()}</td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>Open your invitation link to accept</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <div className="empty">No pending invitations. Students join by invitation only — ask your teacher for a link.</div>}
      </section>
      {sent.length || viewer.profile.role === "teacher" || viewer.profile.role === "admin" ? (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Sent (pending)</h2>
          {sent.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Class</th><th>Email</th><th>Role</th><th>Expires</th><th></th></tr></thead>
              <tbody>
                {sent.map((i) => (
                  <tr key={i.id as string}>
                    <td>{names[i.class_id as string] ?? (i.class_id as string)}</td>
                    <td>{i.email as string}</td>
                    <td>{i.role_in_class as string}</td>
                    <td>{new Date(i.expires_at as string).toLocaleDateString()}</td>
                    <td>
                      <form action={revokeAction.bind(null, i.id as string)}>
                        <button className="btn secondary" type="submit">Revoke</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : <div className="empty">No pending sent invitations.</div>}
        </section>
      ) : null}
    </>
  );
}
