"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getGradesAction, saveGradeAction, getSuggestionsAction, suggestForAction, resolveSuggestionAction } from "./grade-actions";

interface Suggestion {
  id: string;
  student_id: string;
  suggested_score: number;
  suggested_feedback: string;
  criteria: string;
  confidence: string;
}

interface Sub {
  student_id: string;
  studentName: string;
  status: string;
}

export function Gradebook({ assignmentId, maxPoints, students }: { assignmentId: string; maxPoints: number; students: Sub[] }) {
  const router = useRouter();
  const [grades, setGrades] = useState<Record<string, { score: string; feedback: string }>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function loadSuggestions() {
    try {
      setSuggestions(await getSuggestionsAction(assignmentId));
    } catch {
      // AI may be unconfigured; manual grading still works
    }
  }

  useEffect(() => {
    loadSuggestions();
  }, [assignmentId]);

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
      {suggestions.length ? (
        <>
          <h4>AI suggestions awaiting your decision ({suggestions.length})</h4>
          {suggestions.map((s) => (
            <SuggestionCard key={s.id} s={s} maxPoints={maxPoints} onDone={(m) => { setMsg(m); loadSuggestions(); router.refresh(); }} />
          ))}
        </>
      ) : null}
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
              <td><button className="btn secondary" disabled={saving === s.student_id} onClick={() => save(s.student_id)}>Save</button>{" "}
                <button className="btn ghost" title="Get AI suggestion" onClick={async () => {
                  setSaving(s.student_id);
                  try {
                    await suggestForAction(assignmentId, s.student_id);
                    setMsg("AI suggestion ready.");
                    loadSuggestions();
                  } catch (e) {
                    setMsg(e instanceof Error ? e.message : "AI failed.");
                  } finally {
                    setSaving(null);
                  }
                }}>AI</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}

function SuggestionCard({ s, maxPoints, onDone }: { s: Suggestion; maxPoints: number; onDone: (m: string) => void }) {
  const [score, setScore] = useState(String(s.suggested_score));
  const [feedback, setFeedback] = useState(s.suggested_feedback);
  const [busy, setBusy] = useState(false);
  async function act(decision: string) {
    setBusy(true);
    try {
      await resolveSuggestionAction(s.id, { decision, score: Number(score), feedback });
      onDone(decision === "reject" ? "Suggestion rejected." : decision === "approve" ? "AI grade approved." : "Modified grade saved.");
    } catch (e) {
      onDone(e instanceof Error ? e.message : "Failed.");
      setBusy(false);
    }
  }
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <b>Suggested: {s.suggested_score} / {maxPoints}</b> <span className="badge">confidence: {s.confidence}</span>
      <p>{s.suggested_feedback}</p>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>Criteria: {s.criteria || "—"}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn secondary" disabled={busy} onClick={() => act("approve")}>Approve</button>
        <input className="input" style={{ width: 90 }} type="number" min={0} max={maxPoints} value={score} onChange={(e) => setScore(e.target.value)} aria-label="Modified score" />
        <input className="input" style={{ flex: 1, minWidth: 160 }} maxLength={2000} value={feedback} onChange={(e) => setFeedback(e.target.value)} aria-label="Modified feedback" />
        <button className="btn secondary" disabled={busy} onClick={() => act("modify")}>Modify & save</button>
        <button className="btn ghost" disabled={busy} onClick={() => act("reject")}>Reject</button>
      </div>
    </div>
  );
}
