"use client";

import { useState } from "react";
import { requestPlanAction } from "../plans/actions";
import { PLAN_FLAGS } from "@/lib/plan-flags";

export function PlanRequestForm({ name, email }: { name: string; email: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await requestPlanAction({
        name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""),
        organization: String(fd.get("org") ?? ""), message: String(fd.get("msg") ?? ""),
      });
      setMsg("Request sent. Sales will contact you.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form">
      {msg ? <p>{msg}</p> : null}
      <div className="grid cols-2">
        <label className="field">Name<input className="input" name="name" required maxLength={120} defaultValue={name} /></label>
        <label className="field">Email<input className="input" name="email" type="email" required defaultValue={email} /></label>
      </div>
      <label className="field">Organization<input className="input" name="org" maxLength={200} placeholder="School name" /></label>
      <label className="field">What do you need?<textarea className="input" name="msg" rows={3} required minLength={10} maxLength={3000} placeholder="e.g. 20 classes and 500 students for our school" /></label>
      <div><button className="btn" type="submit" disabled={busy}>{busy ? "Sending…" : "Send request"}</button></div>
    </form>
  );
}

export function UsageBars({ features, used }: { features: Record<string, number>; used: { classes: number; storage_mb: number; ai_monthly: number } }) {
  const bar = (u: number, l: number | undefined) => {
    const pct = l ? Math.min(100, Math.round((u / l) * 100)) : 0;
    return <div style={{ background: "var(--border)", borderRadius: 6, height: 8 }}><div style={{ width: `${pct}%`, background: "var(--primary)", height: 8, borderRadius: 6 }} /></div>;
  };
  return (
    <>
      {(["classes.max", "storage_mb.max", "ai_monthly.max"] as const).map((k) => {
        const u = k === "classes.max" ? used.classes : k === "storage_mb.max" ? used.storage_mb : used.ai_monthly;
        const l = features[k];
        const unit = k === "storage_mb.max" ? " MB" : "";
        return <div key={k}><p><b>{k}</b>: {u}{unit} / {l ?? "—"}{unit}</p>{typeof l === "number" ? bar(u, l) : null}</div>;
      })}
      <p>Students per class limit: <b>{features["students_per_class.max"] ?? "—"}</b></p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PLAN_FLAGS.map((k) => <span key={k} className={`badge ${features[k] ? "success" : "danger"}`}>{k}{features[k] ? "" : " (off)"}</span>)}
      </div>
    </>
  );
}
