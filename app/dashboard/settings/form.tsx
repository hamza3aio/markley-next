"use client";

import { useActionState } from "react";
import { updateSettingsAction } from "./actions";

export function SettingsForm({ profile }: {
  profile: { full_name: string; theme: { primary: string; secondary: string; mode: string }; email_notifications: boolean };
}) {
  const [msg, submit, pending] = useActionState(updateSettingsAction, null);
  const t = profile.theme ?? { primary: "#2563eb", secondary: "#0ea5e9", mode: "light" };
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>Personalization</h2>
      {msg ? <div className="alert error">{msg}</div> : null}
      <form action={submit} className="form">
        <label className="field">Display name
          <input className="input" name="full_name" maxLength={120} defaultValue={profile.full_name ?? ""} />
        </label>
        <div className="grid cols-3">
          <label className="field">Primary color<input className="input" name="primary" type="color" defaultValue={t.primary} /></label>
          <label className="field">Secondary color<input className="input" name="secondary" type="color" defaultValue={t.secondary} /></label>
          <label className="field">Mode
            <select className="input" name="mode" defaultValue={t.mode}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
        <label style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" name="email_notif" defaultChecked={profile.email_notifications !== false} /> Email notifications
        </label>
        <div><button className="btn" type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div>
      </form>
    </section>
  );
}
