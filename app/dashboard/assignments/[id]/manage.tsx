"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getUploadUrlAction } from "@/app/dashboard/classes/[id]/content-actions";
import { confirmAttachmentAction, deleteAssignmentAction } from "@/app/dashboard/classes/[id]/assignment-actions";

export function AttachForm({ assignmentId, classId }: { assignmentId: string; classId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const up = await getUploadUrlAction(classId, assignmentId, { purpose: "assignment", name: file.name, mime: file.type || "application/octet-stream", size: file.size });
      const sb = createClient();
      const { error } = await sb.storage.from(up.bucket).uploadToSignedUrl(up.path, up.token, file);
      if (error) throw new Error("Upload failed. Please try again.");
      await confirmAttachmentAction(assignmentId, { path: up.path, name: file.name, mime: file.type || "application/octet-stream", size: file.size });
      setMsg("Attachment added.");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="form" style={{ marginTop: 12 }}>
      <label className="field">Attach file (teacher only)<input className="input" type="file" onChange={onChange} disabled={busy} /></label>
      {msg ? <p style={{ color: "var(--muted)" }}>{msg}</p> : null}
    </div>
  );
}

export function DeleteAssignmentButton({ assignmentId, classId }: { assignmentId: string; classId: string }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm("Delete this assignment?")) return;
    setBusy(true);
    try {
      await deleteAssignmentAction(assignmentId, classId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed.");
      setBusy(false);
    }
  }
  return <button className="btn danger" onClick={remove} disabled={busy}>Delete</button>;
}
