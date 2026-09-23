"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateQuizAction, saveQuizAction, type QuizDraft } from "./actions";

const KINDS = ["mcq", "short", "essay"];

export function QuizGenerator({ classIds, canTargetClass }: { classIds: string[]; canTargetClass: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [targetClass, setTargetClass] = useState("");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const kinds = KINDS.filter((k) => fd.get(`k_${k}`));
    if (!kinds.length) { setMsg("Pick at least one question type."); return; }
    setBusy(true);
    setMsg(null);
    try {
      const d = await generateQuizAction({
        subject: String(fd.get("subject") ?? ""),
        topic: String(fd.get("topic") ?? ""),
        difficulty: String(fd.get("difficulty") ?? "medium"),
        count: Number(fd.get("count") ?? 5),
        kinds,
        class_id: (fd.get("class") as string) || undefined,
      });
      setDraft(d);
      setTitle(d.title);
      const cls = fd.get("class") as string;
      setTargetClass(cls ?? "");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const id = await saveQuizAction({
        title: title || draft.title, topic: draft.topic, difficulty: draft.difficulty,
        class_id: targetClass || null, status: targetClass ? "draft" : "personal", questions: draft.questions,
      });
      router.push(`/dashboard/quizzes/${id}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed.");
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>AI quiz generator</h3>
      {msg ? <p>{msg}</p> : null}
      <form onSubmit={generate} className="form">
        <div className="grid cols-3">
          <label className="field">Subject<input className="input" name="subject" required maxLength={80} /></label>
          <label className="field">Topic<input className="input" name="topic" required maxLength={300} /></label>
          <label className="field">Difficulty
            <select className="input" name="difficulty" defaultValue="medium">
              <option>easy</option><option>medium</option><option>hard</option>
            </select>
          </label>
          <label className="field">Questions<input className="input" name="count" type="number" min={1} max={20} defaultValue={5} /></label>
          {canTargetClass ? (
            <label className="field">Save to
              <select className="input" name="class" defaultValue="">
                <option value="">Personal (only me)</option>
                {classIds.map((c) => <option key={c} value={c}>{c.slice(0, 8)}…</option>)}
              </select>
            </label>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
          <label><input type="checkbox" name="k_mcq" defaultChecked /> MCQ</label>
          <label><input type="checkbox" name="k_short" /> Short answer</label>
          <label><input type="checkbox" name="k_essay" /> Essay</label>
        </div>
        <div><button className="btn" type="submit" disabled={busy}>{busy ? "Generating…" : "Generate"}</button></div>
      </form>
      {draft ? (
        <div style={{ marginTop: 12 }}>
          <label className="field">Title<input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></label>
          {draft.questions.map((q, i) => (
            <div key={i} className="card" style={{ marginTop: 8 }}>
              <b>Q{i + 1} ({q.kind}, {q.points} pts)</b>
              <p>{q.prompt}</p>
              {q.kind === "mcq" ? <div>{q.options.map((o) => <div key={o}>○ {o}{o === q.answer ? " (correct)" : ""}</div>)}</div>
                : <p style={{ color: "var(--muted)" }}>Model answer: {q.answer || "—"}</p>}
              <button className="btn ghost" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn" disabled={busy} onClick={save}>Save quiz</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
