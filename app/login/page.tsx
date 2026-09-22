"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInAction } from "./actions";

export default function LoginPage() {
  const [error, submit, pending] = useActionState(signInAction, null);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/"><span className="brand-mark">M</span> Markley</Link>
        </div>
      </header>
      <main className="container" style={{ maxWidth: 480, padding: "32px 16px" }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Sign in</h1>
          {error ? <div className="alert error" role="alert">{error}</div> : null}
          <form action={submit} className="form">
            <label className="field">Email
              <input className="input" name="email" type="email" required autoComplete="email" />
            </label>
            <label className="field">Password
              <input className="input" name="password" type="password" required autoComplete="current-password" />
            </label>
            <button className="btn" type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Students join by invitation only. New sign-ups create a <b>pending</b> account requiring email verification and admin activation.
          </p>
          <p style={{ fontSize: 14 }}>
            <Link href="/signup">Create pending account</Link> · <Link href="/reset">Forgot password?</Link>
          </p>
        </div>
      </main>
    </>
  );
}
