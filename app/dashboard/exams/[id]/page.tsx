import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { PURPOSE, signedDownload } from "@/lib/files";
import { getExamMeta } from "../actions";
import { ExamUpload, DeleteExamForm } from "../forms";

export default async function ExamDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: exam } = await admin.from("exams").select("*").eq("id", id).single();
  if (!exam) notFound();
  const manager = isAdmin(viewer) || can(viewer, "exams.manage");
  const { subjects, boards } = await getExamMeta();
  const sName = subjects.find((s) => s.code === exam.subject_code)?.name ?? (exam.subject_code as string);
  const bName = boards.find((b) => b.code === exam.board_code)?.name ?? (exam.board_code as string);

  const { data: resources } = await admin.from("exam_resources").select("*").eq("exam_id", id).order("created_at", { ascending: true });
  const withUrls = await Promise.all(((resources ?? []) as { id: string; label: string; name: string; storage_path: string }[]).map(async (r) => ({
    ...r,
    downloadUrl: await signedDownload(admin, PURPOSE.exam_resource.bucket, r.storage_path),
  })));
  const questionUrl = exam.question_path ? await signedDownload(admin, PURPOSE.exam_question.bucket, exam.question_path as string) : null;
  const markschemeUrl = exam.markscheme_path ? await signedDownload(admin, PURPOSE.exam_question.bucket, exam.markscheme_path as string) : null;

  return (    <>
      <section className="card">
        <Link className="btn ghost" href="/dashboard/exams">← Exams</Link>
        <h2 style={{ margin: "8px 0 4px" }}>{(exam.title as string) || `${sName} ${exam.paper as string}`}</h2>
        <p style={{ color: "var(--muted)", margin: 0 }}>{sName} · {bName} · {exam.year as number} · {exam.session as string} · {exam.paper as string}</p>
        {manager ? (
          <DeleteExamForm examId={id} />
        ) : null}
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Question paper</h3>
        {questionUrl ? <a className="btn" href={questionUrl} target="_blank" rel="noopener">Open {(exam.question_name as string) || "question paper"}</a> : <div className="empty">Not uploaded yet.</div>}
        {manager ? <ExamUpload examId={id} kind="question" label="Upload question paper (PDF)" /> : null}
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Mark scheme</h3>
        {markschemeUrl ? <a className="btn" href={markschemeUrl} target="_blank" rel="noopener">Open {(exam.markscheme_name as string) || "mark scheme"}</a> : <div className="empty">Not uploaded yet.</div>}
        {manager ? <ExamUpload examId={id} kind="markscheme" label="Upload mark scheme (PDF)" /> : null}
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Additional resources ({withUrls.length})</h3>
        {withUrls.length ? (
          <div className="table-wrap"><table><tbody>
            {withUrls.map((r) => (
              <tr key={r.id}>
                <td>{r.label}<br /><small style={{ color: "var(--muted)" }}>{r.name}</small></td>
                <td>{r.downloadUrl ? <a className="btn secondary" href={r.downloadUrl} target="_blank" rel="noopener">Open</a> : null}</td>
              </tr>
            ))}
          </tbody></table></div>
        ) : <div className="empty">No extra resources.</div>}
        {manager ? <ExamUpload examId={id} kind="resource" label="Add resource" /> : null}
      </section>
    </>
  );
}
