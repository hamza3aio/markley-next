"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getGradesAction, saveGradeAction } from "./grade-actions";

interface Sub {
  student_id: string;
  studentName: string;
  status: string;
}

export function Gradebook({ assignmentId, maxPoints, students }: { assignmentId: string; maxPoints: number; students: Sub[] }) {
  const router = useRouter();
  const [grades, setGrades] = useState<Record<string, { score: string; feedback: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    getGradesAction(assignmentId).then((g) => {
      const map: Record<string, { score: string; feedback: string }> = {};
      g.forEach((x) => { map[x.student_id] = { score: String(x.score), feedback: x.feedback }; });
      setGrades(map);
    }).catch(() => {});
  }, [assignmentId]);

  async function save(studentId: string) {
    const g = grades[studentId] ?? { score: "", feedback: "" };
    setSaving(studentId);
    setMsg(null);
    try {
      await saveGradeAction(assignmentId, studentId, Number(g.score), g.feedback);
      setMsg("Grade saved.");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(null);
    }
  }

  if (!students.length) return <div className="empty">No submissions yet.</div>;
  return (
    <>
      {msg ? <p>{msg}</p> : null}
      <div className="table-wrap"><table>
        <thead><tr><th>Student</th><th>Status</th><th>Grade / {maxPoints}</th><th></th></tr></thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.student_id}>
              <td>{s.studentName}</td>
              <td><span className="badge">{s.status}</span></td>
              <td>
                <input className="input" style={{ width: 80 }} type="number" min={0} max={maxPoints} step={0.5}
                  aria-label="Score" value={grades[s.student_id]?.score ?? ""}
                  onChange={(e) => setGrades((g) => ({ ...g, [s.student_id]: { score: e.target.value, feedback: g[s.student_id]?.feedback ?? "" } }))} />
                <input className="input" style={{ marginTop: 4, minWidth: 140 }} maxLength={2000} placeholder="Feedback" aria-label="Feedback"
                  value={grades[s.student_id]?.feedback ?? ""}
                  onChange={(e) => setGrades((g) => ({ ...g, [s.student_id]: { score: g[s.student_id]?.score ?? "", feedback: e.target.value } }))} />
              </td>
              <td><button className="btn secondary" disabled={saving === s.student_id} onClick={() => save(s.student_id)}>Save</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}
