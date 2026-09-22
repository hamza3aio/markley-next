import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassAccess, getMembers } from "@/lib/classes";
import { InviteForm, EditClassForm, DeleteClassButton } from "./forms";

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const access = await getClassAccess(admin, viewer, id);
  if (!access) notFound();
  const { cls, member, teacher } = access;
  const myRole = member?.role_in_class ?? (isAdmin(viewer) ? "admin" : "parent");
  const owner = cls.teacher_id === viewer.id;
  const editor = isAdmin(viewer) || (owner && (can(viewer, "class.edit") || can(viewer, "class.delete")));
  const inviter =
    isAdmin(viewer) || owner || (member?.role_in_class === "assistant" && can(viewer, "class.invite"));
  const members = await getMembers(admin, id);

  return (
    <>
      <section className="card">
        <Link className="btn ghost" href="/dashboard/classes">← Classes</Link>
        <h2 style={{ margin: "8px 0 4px" }}>{cls.name}</h2>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          {cls.subject} · Teacher: {teacher?.full_name || teacher?.email || "—"} · {members.length} member{members.length === 1 ? "" : "s"} · You: <span className="badge">{myRole}</span>
        </p>
        {cls.description ? <p>{cls.description}</p> : null}
        {editor ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <EditClassForm classId={cls.id} name={cls.name} subject={cls.subject} description={cls.description} />
            <DeleteClassButton classId={cls.id} name={cls.name} />
          </div>
        ) : null}
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Members</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Class role</th><th>Joined</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id as string}>
                  <td>{(m.profile as { full_name?: string } | null)?.full_name || "—"}</td>
                  <td>{(m.profile as { email?: string } | null)?.email || ""}</td>
                  <td><span className="badge">{m.role_in_class as string}</span></td>
                  <td>{new Date(m.joined_at as string).toLocaleDateString()}</td>
                </tr>
              )) || <tr><td colSpan={4}>No members.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {inviter ? <InviteForm classId={cls.id} /> : null}
    </>
  );
}
