"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createClassAction } from "./actions";

export function NewClassForm({ isAdmin }: { isAdmin: boolean }) {
  const [error, submit, pending] = useActionState(createClassAction, null);
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>New class</h2>
      {error ? <div className="alert error">{error}</div> : null}
      <form action={submit} className="form">
        <label className="field">Class name
          <input className="input" name="name" required minLength={3} maxLength={120} placeholder="IGCSE Physics — Year 10" />
        </label>
        <label className="field">Subject
          <input className="input" name="subject" required minLength={2} maxLength={80} placeholder="Physics" />
        </label>
        <label className="field">Description
          <textarea className="input" name="description" rows={3} maxLength={2000} />
        </label>
        {isAdmin ? (
          <label className="field">Owner teacher email (optional)
            <input className="input" name="teacher_email" type="email" placeholder="teacher@school.edu" />
          </label>
        ) : null}
        <div><button className="btn" type="submit" disabled={pending}>{pending ? "Creating…" : "Create"}</button></div>
      </form>
    </section>
  );
}

export function BackLink() {
  return <Link className="btn ghost" href="/dashboard/classes">← Classes</Link>;
}
