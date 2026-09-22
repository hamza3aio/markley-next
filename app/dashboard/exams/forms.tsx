"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createExamAction, addMetaAction, examUploadUrlAction, confirmExamFileAction, addExamResourceAction, deleteExamAction } from "./actions";

export function NewExamForm({ subjects, boards }: { subjects: { code: string; name: string }[]; boards: { code: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const years: number[] = [];
  for (let y = new Date().getFullYear() + 1; y >= 2015; y--) years.push(y);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const id = await createExamAction({
        subject_code: String(fd.get("subject") ?? ""),
        board_code: String(fd.get("board") ?? ""),
        year: Number(fd.get("year") ?? 0),
        session: String(fd.get("session") ?? ""),
        paper: String(fd.get("paper") ?? ""),
        title: String(fd.get("title") ?? ""),
      });
      router.push(`/dashboard/exams/${id}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Create failed.");
      setBusy(false);
    }
  }

  async function addMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await addMetaAction(String(fd.get("kind") ?? ""), String(fd.get("code") ?? ""), String(fd.get("name") ?? ""));
      setMsg("Added. Reload to see it in the lists.");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed.");
    }
  }

  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Add exam paper</h2>
      {msg ? <p>{msg}</p> : null}
      <form onSubmit={submit} className="form">
        <div className="grid cols-2">
          <label className="field">Subject
            <select className="input" name="subject">{subjects.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
          </label>
          <label className="field">Board
            <select className="input" name="board">{boards.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</select>
          </label>
          <label className="field">Year
            <select className="input" name="year">{years.map((y) => <option key={y}>{y}</option>)}</select>
          </label>
          <label className="field">Session
            <select className="input" name="session" defaultValue="May/June">
              <option>May/June</option><option>Oct/Nov</option><option>Feb/March</option>
            </select>
          </label>
        </div>
        <label className="field">Paper<input className="input" name="paper" required maxLength={60} placeholder="Paper 2" /></label>
        <label className="field">Title (optional)<input className="input" name="title" maxLength={200} /></label>
        <div><button className="btn" type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button></div>
      </form>
      <form onSubmit={addMeta} className="form" style={{ marginTop: 12 }}>
        <div className="grid cols-3">
          <label className="field">Kind
            <select className="input" name="kind" defaultValue="board">
              <option value="board">Board</option><option value="subject">Subject</option>
            </select>
          </label>
          <label className="field">Code<input className="input" name="code" required pattern="[a-z0-9_]{2,30}" /></label>
          <label className="field">Name<input className="input" name="name" required maxLength={80} /></label>
        </div>
        <div><button className="btn secondary" type="submit">Add board/subject</button></div>
      </form>
    </section>
  );
}

export function ExamUpload({ examId, kind, label }: { examId: string; kind: "question" | "markscheme" | "resource"; label: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const up = await examUploadUrlAction(examId, kind, { name: file.name, mime: file.type || "application/octet-stream", size: file.size });
      const sb = createClient();
      const { error } = await sb.storage.from(up.bucket).uploadToSignedUrl(up.path, up.token, file);
      if (error) throw new Error("Upload failed. Please try again.");
      if (kind === "resource") {
        const lbl = prompt("Resource label (e.g. Grade thresholds):", file.name);
        if (!lbl) { setBusy(false); return; }
        await addExamResourceAction(examId, { path: up.path, label: lbl, name: file.name, mime: file.type || "application/octet-stream", size: file.size });
      } else {
        await confirmExamFileAction(examId, kind, { path: up.path, name: file.name });
      }
      setDone(true);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="form" style={{ marginTop: 8 }}>
      <label className="field">{label}<input className="input" type="file" accept={kind === "resource" ? undefined : "application/pdf"} onChange={onChange} disabled={busy} /></label>
      {done ? <div className="alert ok">Uploaded.</div> : null}
      {msg ? <p style={{ color: "var(--muted)" }}>{msg}</p> : null}
    </div>
  );
}

export function DeleteExamForm({ examId }: { examId: string }) {
  return (
    <form action={deleteExamAction.bind(null, examId)}>
      <button className="btn danger" type="submit" onClick={(e) => { if (!confirm("Delete this exam and all its files?")) e.preventDefault(); }} style={{ marginTop: 8 }}>Delete</button>
    </form>
  );
}
