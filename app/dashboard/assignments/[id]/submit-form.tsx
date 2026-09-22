"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatBytes } from "@/lib/files-client";
import { getUploadUrlAction } from "@/app/dashboard/classes/[id]/content-actions";
import { submitAssignmentAction, type SubmitFile } from "@/app/dashboard/classes/[id]/assignment-actions";

export function SubmitForm({ assignmentId, classId, type, existing, grade }: {
  assignmentId: string;
  classId: string;
  type: string;
  existing: { status: string; submitted_at: string; text_content: string; files: { name: string }[] } | null;
  grade: { score: string; max_points: string; feedback: string } | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState<{ path: string; name: string; mime: string; size: number } | null>(() => {
    try {
      const raw = sessionStorage.getItem("markley.staged");
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s.assignment_id === assignmentId ? s : null;
    } catch {
      return null;
    }
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = String(fd.get("text") ?? "");
    const input = (e.currentTarget.elements.namedItem("files") as HTMLInputElement);
    const chosen = [...(input?.files ?? [])];
    setBusy(true);
    setMsg(null);
    try {
      const refs: SubmitFile[] = [];
      for (const file of chosen) {
        const up = await getUploadUrlAction(classId, assignmentId, { purpose: "submission", name: file.name, mime: file.type || "application/octet-stream", size: file.size });
        const sb = createClient();
        const { error } = await sb.storage.from(up.bucket).uploadToSignedUrl(up.path, up.token, file);
        if (error) throw new Error("Upload failed. Please try again.");
        refs.push({ path: up.path, name: file.name, mime: file.type || "application/octet-stream", size: file.size });
      }
      if (staged) refs.push({ path: staged.path, name: staged.name, mime: staged.mime, size: staged.size });
      const { status } = await submitAssignmentAction(assignmentId, { text_content: text, files: refs });
      sessionStorage.removeItem("markley.staged");
      setStaged(null);
      setMsg(`Submitted (${status}).`);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Submit failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>My submission {existing ? <span className="badge success">{existing.status}</span> : null}</h3>
      {grade ? <div className="alert ok"><b>Grade: {grade.score} / {grade.max_points}</b>{grade.feedback ? <><br />{grade.feedback}</> : null}</div> : null}
      {existing ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Submitted {new Date(existing.submitted_at).toLocaleString()}. Submitting again replaces it.</p> : null}
      {existing?.files.length ? <p>Current files:<br />{existing.files.map((f) => f.name).join(", ")}</p> : null}
      {staged ? <div className="alert ok">Scanned PDF ready: {staged.name} ({formatBytes(staged.size)}) — attached on submit.</div> : null}
      <form onSubmit={onSubmit} className="form">
        {type === "guided" ? (
          <label className="field">Written answer (required)<textarea className="input" name="text" rows={6} maxLength={20000} required defaultValue={existing?.text_content ?? ""} /></label>
        ) : (
          <label className="field">Notes (optional)<textarea className="input" name="text" rows={3} maxLength={20000} defaultValue={existing?.text_content ?? ""} /></label>
        )}
        <label className="field">Files {type === "normal" ? "(at least one required)" : "(optional, up to 10)"}
          <input className="input" name="files" type="file" multiple required={type === "normal" && !existing?.files.length && !staged} />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit"}</button>
          <a className="btn secondary" href={`/scan?class=${classId}&assignment=${assignmentId}`}>Scan with camera</a>
        </div>
        {msg ? <p>{msg}</p> : null}
      </form>
    </section>
  );
}
