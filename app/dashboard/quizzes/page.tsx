import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizGenerator } from "./generator";

export default async function QuizzesPage() {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: memberships } = await admin.from("class_members").select("class_id").eq("user_id", viewer.id).eq("status", "active");
  const cids = [...new Set(((memberships ?? []) as { class_id: string }[]).map((m) => m.class_id))];
  const { data: personal } = await admin.from("quizzes").select("id,title,topic,difficulty,source,status,created_at").is("class_id", null).eq("created_by", viewer.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  let classQ: { id: string; title: string; topic: string; difficulty: string; status: string }[] = [];
  if (cids.length) {
    const { data } = await admin.from("quizzes").select("id,title,topic,difficulty,source,status,class_id,created_at").in("class_id", cids).is("deleted_at", null).order("created_at", { ascending: false }).limit(200);
    classQ = ((data ?? []) as typeof classQ).filter((q) => {
      if (q.status === "published") return true;
      return ["teacher", "assistant", "admin"].includes(viewer.profile.role);
    });
  }

  return (
    <>
      <section className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Quizzes</h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>AI-generated practice is private to you unless a teacher publishes it.</p>
        </div>
      </section>
      <QuizGenerator classIds={cids} canTargetClass={viewer.profile.role === "teacher" || viewer.profile.role === "admin"} />
      <section className="card">
        <h3 style={{ marginTop: 0 }}>My practice quizzes ({(personal ?? []).length})</h3>
        {(personal ?? []).length ? (
          <div className="table-wrap"><table><tbody>
            {((personal ?? []) as { id: string; title: string; topic: string; difficulty: string; source: string }[]).map((q) => (
              <tr key={q.id}>
                <td>{q.title}<br /><small style={{ color: "var(--muted)" }}>{q.topic} · {q.difficulty} · {q.source}</small></td>
                <td><Link className="btn secondary" href={`/dashboard/quizzes/${q.id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <div className="empty">No personal quizzes. Generate one with AI.</div>}
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Class quizzes ({classQ.length})</h3>
        {classQ.length ? (
          <div className="table-wrap"><table><tbody>
            {classQ.map((q) => (
              <tr key={q.id}>
                <td>{q.title} {q.status !== "published" ? <span className="badge">draft</span> : null}<br /><small style={{ color: "var(--muted)" }}>{q.topic} · {q.difficulty}</small></td>
                <td><Link className="btn secondary" href={`/dashboard/quizzes/${q.id}`}>Open</Link></td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <div className="empty">No class quizzes yet.</div>}
      </section>
    </>
  );
}
