"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUpAction, resetAction } from "./actions";

export function SignUpForm() {
  const [state, submit, pending] = useActionState(signUpAction, {});
  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Create pending account</h1>
      {state?.error ? <div className="alert error">{state.error}</div> : null}
      {state?.ok ? (
        <div className="alert ok">Check your email to verify, then wait for admin activation. <Link href="/login">Go to sign in</Link></div>
      ) : (
        <form action={submit} className="form">
          <label className="field">Full name
            <input className="input" name="name" required maxLength={120} autoComplete="name" />
          </label>
          <label className="field">Email
            <input className="input" name="email" type="email" required autoComplete="email" />
          </label>
          <label className="field">Password (8+ characters)
            <input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <button className="btn" type="submit" disabled={pending}>{pending ? "Creating…" : "Create account"}</button>
        </form>
      )}
      <p style={{ color: "var(--muted)", fontSize: 14 }}>An admin must activate your account and assign the correct role before you can access dashboards.</p>
      <p style={{ fontSize: 14 }}><Link href="/login">Back to sign in</Link></p>
    </div>
  );
}

export function ResetForm() {
  const [state, submit, pending] = useActionState(resetAction, {});
  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Reset password</h1>
      {state?.error ? <div className="alert error">{state.error}</div> : null}
      {state?.ok ? <div className="alert ok">If the email exists, a reset link was sent.</div> : null}
      <form action={submit} className="form">
        <label className="field">Email
          <input className="input" name="email" type="email" required />
        </label>
        <button className="btn" type="submit" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
      </form>
      <p style={{ fontSize: 14 }}><Link href="/login">Back to sign in</Link></p>
    </div>
  );
}
