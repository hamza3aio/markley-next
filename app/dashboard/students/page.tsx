import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LinkParentForm } from "./forms";

export default async function StudentsPage() {
  const viewer = await requireViewer();
  const admin = createAdminClient();

  if (viewer.profile.role === "parent") {
    const { data: links } = await admin.from("parent_student_links").select("student_id").eq("parent_id", viewer.id).eq("status", "active");
    const sids = (links ?? []).map((l) => l.student_id as string);
    const { data: students } = sids.length
      ? await admin.from("profiles").select("id,full_name,email").in("id", sids)
      : { data: [] };
    return (
      <section className="card">
        <h2 style={{ marginTop: 0 }}>My students</h2>
        {(students ?? []).length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Email</th></tr></thead>
            <tbody>{(students ?? []).map((s) => <tr key={s.id as string}><td>{(s.full_name as string) || "—"}</td><td>{s.email as string}</td></tr>)}</tbody>
          </table></div>
        ) : <div className="empty">No linked students yet. Ask your school admin to link your account.</div>}
      </section>
    );
  }

  return (
    <>
      <LinkParentForm />
      <section className="card">
        <h2 style={{ marginTop: 0 }}>How linking works</h2>
        <p style={{ color: "var(--muted)" }}>Link a parent account to a student account by email. Both accounts must exist, be verified and active. Parents get read-only access to their students&apos; classes and progress.</p>
      </section>
    </>
  );
}
