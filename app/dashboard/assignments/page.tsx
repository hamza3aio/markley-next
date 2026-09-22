import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClasses } from "@/lib/classes";
import { listAssignments } from "@/lib/assignments";

export default async function AssignmentsHome() {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const classes = await getClasses(admin, viewer);
  const groups = await Promise.all(
    classes.map(async (c) => {
      try {
        const r = await listAssignments(admin, viewer, c.id);
        return { class: c, items: r?.assignments ?? [], submittedIds: r?.submittedIds ?? [] };
      } catch {
        return { class: c, items: [], submittedIds: [] as string[] };
      }
    })
  );
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <section className="card">
        <h2 style={{ margin: 0 }}>Assignments</h2>
        <p style={{ color: "var(--muted)", margin: 0 }}>{total} assignment{total === 1 ? "" : "s"} across {classes.length} class{classes.length === 1 ? "" : "es"}</p>
      </section>
      {groups.map((g) => (
        <section key={g.class.id} className="card">
          <h3 style={{ marginTop: 0 }}>{g.class.name} <small style={{ color: "var(--muted)" }}>{g.class.subject}</small></h3>
          {!g.items.length ? <div className="empty">No assignments.</div> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Title</th><th>Type</th><th>Due</th><th></th></tr></thead>
              <tbody>
                {g.items.map((a) => (
                  <tr key={a.id}>
                    <td>{a.title} {a.status === "draft" ? <span className="badge">draft</span> : null} {g.submittedIds.includes(a.id) ? <span className="badge success">submitted</span> : null}</td>
                    <td>{a.type}</td>
                    <td>{a.due_date ? new Date(a.due_date).toLocaleString() : "—"}</td>
                    <td><Link className="btn secondary" href={`/dashboard/assignments/${a.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
      ))}
    </>
  );
}
