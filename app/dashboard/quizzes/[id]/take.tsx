"use client";

import { useState } from "react";
import { submitQuizAction, publishQuizAction, deleteQuizAction } from "../actions";

export function TakeQuiz({ quizId, questions }: { quizId: string; questions: { id: string; kind: string; prompt: string; options: string[]; points: number }[] }) {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const answers: Record<string, string> = {};
    questions.forEach((q) => { answers[q.id] = String(fd.get(`a_${q.id}`) ?? ""); });
    setBusy(true);
    try {
      const r = await submitQuizAction(quizId, answers);
      setResult(`Score: ${r.score} / ${r.max} (MCQ portion; written answers pending review)`);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>Take quiz</h3>
      {result ? <div className="alert ok">{result}</div> : null}
      <form onSubmit={submit} className="form">
        {questions.map((q, i) => (
          <div key={q.id}>
            <b>Q{i + 1} ({q.points} pts)</b>
            <p>{q.prompt}</p>
            {q.kind === "mcq"
              ? q.options.map((o) => <label key={o} style={{ display: "block", fontWeight: "normal" }}><input type="radio" name={`a_${q.id}`} value={o} required /> {o}</label>)
              : <textarea className="input" name={`a_${q.id}`} rows={3} maxLength={5000} />}
          </div>
        ))}
        <div><button className="btn" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit answers"}</button></div>
      </form>
    </section>
  );
}

export function QuizManageButtons({ quizId, published, canPublish }: { quizId: string; published: boolean; canPublish: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      {msg ? <span>{msg}</span> : null}
      {canPublish && !published ? (
        <button className="btn" onClick={async () => {
          try { await publishQuizAction(quizId); location.reload(); }
          catch (e) { setMsg(e instanceof Error ? e.message : "Failed."); }
        }}>Publish to class</button>
      ) : null}
      <button className="btn danger" onClick={async () => {
        if (!confirm("Delete this quiz?")) return;
        try { await deleteQuizAction(quizId); location.href = "/dashboard/quizzes"; }
        catch (e) { setMsg(e instanceof Error ? e.message : "Failed."); }
      }}>Delete</button>
    </div>
  );
}
