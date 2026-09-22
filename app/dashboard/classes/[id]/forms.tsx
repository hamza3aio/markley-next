"use client";

import { useActionState, useState } from "react";
import { inviteAction, updateClassAction, deleteClassAction } from "../actions";

export function InviteForm({ classId }: { classId: string }) {
  const [state, submit, pending] = useActionState(inviteAction.bind(null, classId), {});
  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>Invite by email</h3>
      {state?.error ? <div className="alert error">{state.error}</div> : null}
      {state?.link ? (
        <div className="alert ok">Invite created. Share this link:<br /><a href={state.link}>{state.link}</a></div>
      ) : null}
      <form action={submit} className="form">
        <div className="grid cols-3">
          <label className="field">Email<input className="input" name="email" type="email" required /></label>
          <label className="field">Role
            <select className="input" name="role" defaultValue="student">
              <option value="student">Student</option>
              <option value="assistant">Assistant</option>
            </select>
          </label>
          <label className="field">Expires in (days)<input className="input" name="days" type="number" min={1} max={30} defaultValue={7} /></label>
        </div>
        <div><button className="btn" type="submit" disabled={pending}>{pending ? "Sending…" : "Send invite"}</button></div>
      </form>
    </section>
  );
}

export function EditClassForm({ classId, name, subject, description }: { classId: string; name: string; subject: string; description: string }) {
  const [editing, setEditing] = useState(false);
  if (!editing) return <button className="btn secondary" onClick={() => setEditing(true)}>Edit</button>;
  return <ClassEditFields classId={classId} name={name} subject={subject} description={description} onDone={() => setEditing(false)} />;
}

function ClassEditFields({ classId, name, subject, description, onDone }: { classId: string; name: string; subject: string; description: string; onDone: () => void }) {
  const [error, submit, pending] = useActionState(updateClassAction.bind(null, classId), null);
  return (
    <form action={submit} className="form">
      {error ? <div className="alert error">{error}</div> : null}
      <label className="field">Class name<input className="input" name="name" required minLength={3} maxLength={120} defaultValue={name} /></label>
      <label className="field">Subject<input className="input" name="subject" required minLength={2} maxLength={80} defaultValue={subject} /></label>
      <label className="field">Description<textarea className="input" name="description" rows={3} maxLength={2000} defaultValue={description} /></label>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" type="submit" disabled={pending}>Save</button>
        <button className="btn secondary" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export function DeleteClassButton({ classId, name }: { classId: string; name: string }) {
  return (
    <form action={deleteClassAction.bind(null, classId)} onSubmit={(e) => { if (!confirm(`Delete "${name}"? Members lose access.`)) e.preventDefault(); }}>
      <button className="btn danger" type="submit">Delete</button>
    </form>
  );
}
