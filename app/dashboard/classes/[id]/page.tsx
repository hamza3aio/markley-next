import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClassAccess, getMembers } from "@/lib/classes";
import { listAssignments } from "@/lib/assignments";
import { listContentFiles } from "./content-actions";
import { InviteForm, EditClassForm, DeleteClassButton } from "./forms";
import { ContentSection, AssignmentsSection } from "./study";
import { AttendanceSection } from "./attendance";
import { AnalyticsSection } from "./analytics";
import { SessionsSection, EventsSection } from "./schedule";

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
  const canUpload =
    isAdmin(viewer) || owner ||
    (member?.role_in_class === "assistant" && can(viewer, "content.upload")) ||
    (member?.role_in_class === "teacher" && can(viewer, "content.upload"));
  const files = await listContentFiles(id, member?.role_in_class ?? (isAdmin(viewer) ? "admin" : null), myRole === "parent");
  const asgData = await listAssignments(admin, viewer, id);
  const isStaff = ["admin", "teacher", "assistant"].includes(myRole);
  const { data: sessions } = await admin.from("sessions").select("id,title,description,start_at,end_at,meeting_url,provider").eq("class_id", id).is("deleted_at", null).order("start_at", { ascending: true }).limit(200);
  const { data: events } = await admin.from("calendar_events").select("id,title,type,start_at,link").eq("class_id", id).order("start_at", { ascending: true }).limit(200);

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
      <ContentSection classId={cls.id} files={files} canUpload={canUpload} />
      <AssignmentsSection
        classId={cls.id}
        assignments={asgData?.assignments ?? []}
        submittedIds={asgData?.submittedIds ?? []}
        canCreate={isStaff && can(viewer, "assignment.create")}
      />
      <AttendanceSection
        classId={cls.id}
        isStaff={isStaff}
        students={members.filter((m) => m.role_in_class === "student").map((m) => ({
          user_id: m.user_id as string,
          name: ((m.profile as { full_name?: string; email?: string } | null)?.full_name || (m.profile as { email?: string } | null)?.email || "—") as string,
        }))}
      />
      <AnalyticsSection classId={cls.id} canExport={isStaff && can(viewer, "reports.export")} />
      <SessionsSection classId={cls.id} isStaff={isStaff} sessions={(sessions ?? []) as never[]} />
      <EventsSection classId={cls.id} isStaff={isStaff} events={(events ?? []) as never[]} />
    </>
  );
}
