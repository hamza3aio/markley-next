"use client";

import { useActionState } from "react";
import { linkParentAction } from "./actions";

export function LinkParentForm() {
  const [error, submit, pending] = useActionState(linkParentAction, null);
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Link parent to student</h2>
      {error ? <div className="alert error">{error}</div> : null}
      <form action={submit} className="form">
        <div className="grid cols-2">
          <label className="field">Parent email<input className="input" name="parent_email" type="email" required /></label>
          <label className="field">Student email<input className="input" name="student_email" type="email" required /></label>
        </div>
        <div><button className="btn" type="submit" disabled={pending}>{pending ? "Linking…" : "Create link"}</button></div>
      </form>
    </section>
  );
}
