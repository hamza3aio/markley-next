"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatBytes } from "@/lib/files-client";
import {
  getUploadUrlAction,
  confirmContentFileAction,
  renameFileAction,
  deleteFileAction,
} from "./content-actions";
import { createAssignmentAction } from "./assignment-actions";

import type { ContentFile } from "./content-actions";

export function ContentSection({ classId, files, canUpload }: { classId: string; files: ContentFile[]; canUpload: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const up = await getUploadUrlAction(classId, null, { purpose: "content", name: file.name, mime: file.type || "application/octet-stream", size: file.size });
      const sb = createClient();
      const { error } = await sb.storage.from(up.bucket).uploadToSignedUrl(up.path, up.token, file);
      if (error) throw new Error("Upload failed. Please try again.");
      const vis = (document.getElementById("upvis") as HTMLSelectElement)?.value ?? "class";
      const desc = (document.getElementById("updesc") as HTMLInputElement)?.value ?? "";
      await confirmContentFileAction(classId, { path: up.path, name: file.name, mime: file.type || "application/octet-stream", size: file.size, description: desc, visibility: vis });
      setMsg("File uploaded.");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function rename(id: string, current: string) {
    const name = prompt("File name", current);
    if (!name) return;
    try {
      await renameFileAction(id, name);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Rename failed.");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this file?")) return;
    try {
      await deleteFileAction(id);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Content</h3>
        <div className="spacer" />
        <span className="badge">{files.length} files</span>
      </div>
      {canUpload ? (
        <div className="form" style={{ marginTop: 12 }}>
          <div className="grid cols-3">
            <label className="field">File<input className="input" type="file" onChange={upload} disabled={busy} /></label>
            <label className="field">Visibility
              <select className="input" id="upvis" defaultValue="class">
                <option value="class">Whole class</option>
                <option value="teachers">Teachers only</option>
              </select>
            </label>
            <label className="field">Description<input className="input" id="updesc" maxLength={1000} placeholder="Optional" /></label>
          </div>
          {msg ? <p style={{ color: "var(--muted)" }}>{msg}</p> : null}
        </div>
      ) : null}
      <div style={{ marginTop: 8 }}>
        {files.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Name</th><th>Size</th><th>Visibility</th><th></th></tr></thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}<br /><small style={{ color: "var(--muted)" }}>{f.description}</small></td>
                  <td>{formatBytes(f.size_bytes)}</td>
                  <td>{f.visibility}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {f.downloadUrl ? <a className="btn secondary" href={f.downloadUrl} target="_blank" rel="noopener">Open</a> : null}
                    {canUpload ? <><button className="btn ghost" onClick={() => rename(f.id, f.name)}>Rename</button><button className="btn ghost" onClick={() => remove(f.id)}>Delete</button></> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <div className="empty">No files yet.</div>}
      </div>
    </section>
  );
}

export interface AssignmentItem {
  id: string;
  title: string;
  type: string;
  status: string;
  due_date: string | null;
  max_points: number;
}

export function AssignmentsSection({ classId, assignments, submittedIds, canCreate }: { classId: string; assignments: AssignmentItem[]; submittedIds: string[]; canCreate: boolean }) {
  const [showNew, setShowNew] = useState(false);
  const [error, submit, pending] = useActionState(createAssignmentAction.bind(null, classId), null);
  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Assignments</h3>
        <div className="spacer" />
        {canCreate ? <button className="btn" onClick={() => setShowNew((s) => !s)}>New assignment</button> : null}
      </div>
      {showNew ? (
        <form action={submit} className="form" style={{ marginTop: 12 }}>
          {error ? <div className="alert error">{error}</div> : null}
          <label className="field">Title<input className="input" name="title" required minLength={3} maxLength={200} /></label>
          <div className="grid cols-3">
            <label className="field">Type
              <select className="input" name="type" defaultValue="normal">
                <option value="normal">Normal (file upload)</option>
                <option value="guided">Guided (written + file)</option>
              </select>
            </label>
            <label className="field">Status
              <select className="input" name="status" defaultValue="published">
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </label>
            <label className="field">Max points<input className="input" name="max_points" type="number" min={1} max={1000} defaultValue={100} /></label>
          </div>
          <div className="grid cols-2">
            <label className="field">Due date (optional)<input className="input" name="due_date" type="datetime-local" /></label>
            <label className="field">Late submissions
              <select className="input" name="allow_late" defaultValue="no">
                <option value="no">Not allowed</option>
                <option value="yes">Allowed</option>
              </select>
            </label>
          </div>
          <label className="field">Description<textarea className="input" name="description" rows={2} maxLength={5000} /></label>
          <label className="field">Instructions<textarea className="input" name="instructions" rows={3} maxLength={5000} /></label>
          <div><button className="btn" type="submit" disabled={pending}>{pending ? "Creating…" : "Create"}</button></div>
        </form>
      ) : null}
      <div style={{ marginTop: 8 }}>
        {assignments.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Title</th><th>Type</th><th>Due</th><th>Points</th><th></th></tr></thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>{a.title} {a.status === "draft" ? <span className="badge">draft</span> : null} {submittedIds.includes(a.id) ? <span className="badge success">submitted</span> : null}</td>
                  <td>{a.type}</td>
                  <td>{a.due_date ? new Date(a.due_date).toLocaleString() : "—"}</td>
                  <td>{a.max_points}</td>
                  <td><Link className="btn secondary" href={`/dashboard/assignments/${a.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <div className="empty">No assignments yet.</div>}
      </div>
    </section>
  );
}
