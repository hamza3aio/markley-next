"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateAssignmentDraftAction } from "../../quizzes/actions";
import { createAssignmentAction } from "./assignment-actions";

export function AIAssignmentDraft({ classId, classSubject }: { classId: string; classSubject: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<{ title: string; description: string; instructions: string; type: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastType, setLastType] = useState("normal");

  async function generate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const d = await generateAssignmentDraftAction({
        subject: String(fd.get("subject") ?? classSubject),
        topic: String(fd.get("topic") ?? ""),
        difficulty: String(fd.get("difficulty") ?? "medium"),
        instructions: String(fd.get("instructions") ?? ""),
        count: Number(fd.get("count") ?? 5),
        type: String(fd.get("type") ?? "normal"),
      });
      setDraft(d);
      setLastType(String(fd.get("type") ?? "normal"));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function publish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await createAssignmentAction(classId, null, fd);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Publish failed.");
      setBusy(false);
    }
  }

  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>AI assignment draft</h3>
        <div className="spacer" />
        <button className="btn secondary" onClick={() => setOpen((o) => !o)}>Generate with AI</button>
      </div>
      {msg ? <p>{msg}</p> : null}
      {open && !draft ? (
        <form onSubmit={generate} className="form" style={{ marginTop: 12 }}>
          <div className="grid cols-3">
            <label className="field">Subject<input className="input" name="subject" defaultValue={classSubject} maxLength={80} /></label>
            <label className="field">Topic<input className="input" name="topic" required maxLength={300} /></label>
            <label className="field">Difficulty
              <select className="input" name="difficulty" defaultValue="medium">
                <option>easy</option><option>medium</option><option>hard</option>
              </select>
            </label>
            <label className="field">Tasks<input className="input" name="count" type="number" min={1} max={20} defaultValue={5} /></label>
            <label className="field">Type
              <select className="input" name="type" defaultValue="normal">
                <option value="normal">Normal</option><option value="guided">Guided</option>
              </select>
            </label>
          </div>
          <label className="field">Extra instructions<textarea className="input" name="instructions" rows={2} maxLength={2000} /></label>
          <div><button className="btn" type="submit" disabled={busy}>{busy ? "Generating…" : "Generate draft"}</button></div>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>AI drafts are never published automatically. Review and edit first.</p>
        </form>
      ) : null}
      {draft ? (
        <form onSubmit={publish} className="form" style={{ marginTop: 12 }}>
          <div className="alert ok">Draft ready — review, edit, then publish. Nothing is published until you click Publish.</div>
          <label className="field">Title<input className="input" name="title" required maxLength={200} defaultValue={draft.title} /></label>
          <input type="hidden" name="type" value={lastType} />
          <input type="hidden" name="status" value="draft" />
          <input type="hidden" name="max_points" value="100" />
          <input type="hidden" name="allow_late" value="no" />
          <label className="field">Description<textarea className="input" name="description" rows={2} maxLength={5000} defaultValue={draft.description} /></label>
          <label className="field">Instructions<textarea className="input" name="instructions" rows={4} maxLength={5000} defaultValue={draft.instructions} /></label>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? "Publishing…" : "Save as draft"}</button>
            <button className="btn secondary" type="button" onClick={() => setDraft(null)}>Discard</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
