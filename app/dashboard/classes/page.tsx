import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClasses } from "@/lib/classes";
import { NewClassForm } from "./forms";

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const classes = await getClasses(admin, viewer);
  const showNew = (await searchParams).new === "1" && can(viewer, "class.create");

  return (
    <>
      <section className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Classes</h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>{classes.length} class{classes.length === 1 ? "" : "es"}</p>
        </div>
        <div className="spacer" />
        {can(viewer, "class.create") ? <Link className="btn" href="/dashboard/classes?new=1">New class</Link> : null}
      </section>
      {showNew ? <NewClassForm isAdmin={isAdmin(viewer)} /> : null}
      {classes.length ? (
        <section className="grid cols-3">
          {classes.map((c) => (
            <div key={c.id} className="card">
              <h3 style={{ margin: "0 0 4px" }}>{c.name}</h3>
              <p style={{ color: "var(--muted)", margin: "0 0 12px" }}>{c.subject}</p>
              <Link className="btn secondary" href={`/dashboard/classes/${c.id}`}>Open</Link>
            </div>
          ))}
        </section>
      ) : (
        <div className="empty">{viewer.profile.role === "parent" ? "No classes for your linked students yet." : "No classes yet."}</div>
      )}
    </>
  );
}
