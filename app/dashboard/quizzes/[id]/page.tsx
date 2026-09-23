import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { TakeQuiz, QuizManageButtons } from "./take";

export default async function QuizDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: quiz } = await admin.from("quizzes").select("*").eq("id", id).is("deleted_at", null).single();
  if (!quiz) notFound();
  const q = quiz as { id: string; class_id: string | null; title: string; topic: string; difficulty: string; source: string; status: string; created_by: string };

  let teacher = isAdmin(viewer) || q.created_by === viewer.id;
  let enrolled = q.created_by === viewer.id;
  if (q.class_id) {
    const { data: member } = await admin.from("class_members").select("role_in_class").eq("class_id", q.class_id).eq("user_id", viewer.id).eq("status", "active").single();
    const { data: cls } = await admin.from("classes").select("teacher_id").eq("id", q.class_id).single();
    teacher = teacher || cls?.teacher_id === viewer.id ||
      (!!member && ((member as { role_in_class: string }).role_in_class === "teacher" || (member as { role_in_class: string }).role_in_class === "assistant"));
    enrolled = enrolled || !!member;
    if (q.status !== "published" && !teacher && q.created_by !== viewer.id) {
      return <div className="empty">Quiz is not published.</div>;
    }
  }
  if (!enrolled && !teacher) notFound();

  const { data: questions } = await admin.from("quiz_questions").select("*").eq("quiz_id", id).order("position");
  const qs = ((questions ?? []) as { id: string; kind: string; prompt: string; options: string[]; answer: string; points: number }[]).map((x) =>
    !teacher && q.created_by !== viewer.id && q.status === "published" && x.kind === "mcq" ? { ...x, answer: "" } : x
  );
  const { data: attempts } = await admin.from("quiz_attempts").select("*, profiles!quiz_attempts_student_id_fkey(full_name,email)").eq("quiz_id", id).order("submitted_at", { ascending: false }).limit(200);
  // Fallback if FK embed name differs:
  let attRows = (attempts ?? []) as { id: string; student_id: string; score: number; max_points: number; submitted_at: string; student?: { full_name?: string; email?: string } }[];
  if (attRows.length && !attRows[0].student) {
    const sids = [...new Set(attRows.map((a) => a.student_id))];
    const { data: profs } = await admin.from("profiles").select("id,full_name,email").in("id", sids);
    const byId = Object.fromEntries(((profs ?? []) as { id: string; full_name: string; email: string }[]).map((p) => [p.id, p]));
    attRows = attRows.map((a) => ({ ...a, student: byId[a.student_id] }));
  }
  const mine = teacher ? attRows : attRows.filter((a) => a.student_id === viewer.id);

  return (
    <>
      <section className="card">
        <Link className="btn ghost" href="/dashboard/quizzes">← Quizzes</Link>
        <h2 style={{ margin: "8px 0 4px" }}>{q.title}</h2>
        <p style={{ color: "var(--muted)", margin: 0 }}>{q.topic} · {q.difficulty} · {q.source} · {q.status} · {qs.length} questions</p>
        {teacher ? <QuizManageButtons quizId={id} published={q.status === "published"} canPublish={q.status !== "published" && !!q.class_id} /> : null}
      </section>
      {!teacher ? <TakeQuiz quizId={id} questions={qs} /> : (
        <section className="card">
          <h3 style={{ marginTop: 0 }}>Answer key</h3>
          {qs.map((x, i) => (
            <div key={x.id}><b>Q{i + 1} ({x.points} pts)</b><p>{x.prompt}</p>
              {x.kind === "mcq"
                ? x.options.map((o) => <div key={o}>○ {o}{o === x.answer ? " (correct)" : ""}</div>)
                : <p style={{ color: "var(--muted)" }}>Model answer: {x.answer || "—"}</p>}
            </div>
          ))}
        </section>
      )}
      <section className="card">
        <h3 style={{ marginTop: 0 }}>{teacher ? "Attempts" : "My attempts"}</h3>
        {mine.length ? (
          <div className="table-wrap"><table>
            <thead><tr>{teacher ? <th>Student</th> : null}<th>Score</th><th>When</th></tr></thead>
            <tbody>
              {mine.map((a) => (
                <tr key={a.id}>
                  {teacher ? <td>{a.student?.full_name || a.student?.email || ""}</td> : null}
                  <td><b>{a.score}</b> / {a.max_points}</td>
                  <td>{new Date(a.submitted_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <div className="empty">No attempts yet.</div>}
        <p style={{ color: "var(--muted)", fontSize: 13 }}>MCQ auto-graded. Written answers need teacher review.</p>
      </section>
    </>
  );
}
