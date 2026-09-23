"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createPlanAction, savePlanAction, deletePlanAction, assignPlanAction,
  setRequestStatusAction,
} from "./actions";
import { PLAN_LIMITS, PLAN_FLAGS } from "@/lib/plan-flags";

export interface Plan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number | null;
  is_active: boolean;
  is_default: boolean;
  features: Record<string, number>;
}

export function PlansManager({ initial }: { initial: Plan[] }) {
  const router = useRouter();
  const [plans, setPlans] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(p: Plan) {
    const price = (document.getElementById(`price-${p.id}`) as HTMLInputElement).value;
    const active = (document.getElementById(`active-${p.id}`) as HTMLInputElement).checked;
    const features: Record<string, number> = {};
    [...PLAN_LIMITS, ...PLAN_FLAGS].forEach((k) => {
      const el = document.getElementById(`f-${p.id}-${k}`) as HTMLInputElement;
      features[k] = el.type === "checkbox" ? (el.checked ? 1 : 0) : Number(el.value || 0);
    });
    try {
      await savePlanAction(p.id, { price, active, features });
      setMsg("Plan saved.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed.");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this plan? (Plans in use are deactivated instead.)")) return;
    try {
      const r = await deletePlanAction(id);
      setMsg(r.deactivated ? "Deactivated (in use)." : "Deleted.");
      setPlans(plans.filter((p) => (r.deactivated ? true : p.id !== id)));
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed.");
    }
  }

  return (
    <>
      {msg ? <p>{msg}</p> : null}
      {plans.map((p) => (
        <div key={p.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b>{p.name}</b><code>{p.slug}</code>
            {p.price_monthly ? <span>{p.price_monthly}/mo</span> : <span className="badge success">free</span>}
            {p.is_default ? <span className="badge">default</span> : null}
            {!p.is_active ? <span className="badge danger">inactive</span> : null}
            <div className="spacer" />
            <button className="btn ghost" onClick={() => remove(p.id)}>Delete</button>
          </div>
          <div className="grid cols-3" style={{ marginTop: 8 }}>
            {PLAN_LIMITS.map((k) => (
              <label key={k} className="field">{k}<input className="input" type="number" min={0} id={`f-${p.id}-${k}`} defaultValue={p.features?.[k] ?? ""} /></label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, fontSize: 14 }}>
            {PLAN_FLAGS.map((k) => (
              <label key={k}><input type="checkbox" id={`f-${p.id}-${k}`} defaultChecked={!!p.features?.[k]} /> {k}</label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "end" }}>
            <label className="field">Price/mo<input className="input" type="number" min={0} step={0.01} id={`price-${p.id}`} defaultValue={p.price_monthly ?? ""} style={{ width: 120 }} /></label>
            <label style={{ fontSize: 14 }}><input type="checkbox" id={`active-${p.id}`} defaultChecked={p.is_active} /> Active</label>
            <button className="btn secondary" onClick={() => save(p)}>Save plan</button>
          </div>
        </div>
      ))}
    </>
  );
}

export function CreatePlanForm() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await createPlanAction({ name: String(fd.get("name") ?? ""), slug: String(fd.get("slug") ?? ""), price: String(fd.get("price") ?? "") });
      setMsg("Plan created.");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Create failed.");
    }
  }
  return (
    <form onSubmit={submit} className="form">
      {msg ? <p>{msg}</p> : null}
      <div className="grid cols-3">
        <label className="field">Name<input className="input" name="name" required maxLength={80} /></label>
        <label className="field">Slug<input className="input" name="slug" required pattern="[a-z0-9_]{2,40}" placeholder="school_pro" /></label>
        <label className="field">Price/mo (blank = custom)<input className="input" name="price" type="number" min={0} step={0.01} /></label>
      </div>
      <div><button className="btn" type="submit">Create (copies free features)</button></div>
    </form>
  );
}

export function AssignForm({ slugs }: { slugs: string[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await assignPlanAction(String(fd.get("email") ?? ""), String(fd.get("plan") ?? ""));
      setMsg("Plan assigned.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Assign failed.");
    }
  }
  return (
    <form onSubmit={submit} className="form">
      {msg ? <p>{msg}</p> : null}
      <div className="grid cols-2">
        <label className="field">Teacher email<input className="input" name="email" type="email" required /></label>
        <label className="field">Plan
          <select className="input" name="plan">{slugs.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </label>
      </div>
      <div><button className="btn secondary" type="submit">Assign</button></div>
    </form>
  );
}

export function RequestsInbox({ initial }: { initial: { id: string; name: string; email: string; organization: string; message: string; status: string }[] }) {
  const router = useRouter();
  const [reqs, setReqs] = useState(initial);
  async function set(id: string, status: string) {
    await setRequestStatusAction(id, status);
    setReqs(reqs.map((r) => (r.id === id ? { ...r, status } : r)));
    router.refresh();
  }
  if (!reqs.length) return <div className="empty">No requests.</div>;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>From</th><th>Message</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {reqs.map((r) => (
          <tr key={r.id}>
            <td>{r.name}<br /><small>{r.email} · {r.organization}</small></td>
            <td>{r.message.slice(0, 120)}</td>
            <td><span className="badge">{r.status}</span></td>
            <td style={{ whiteSpace: "nowrap" }}>
              {["contacted", "closed", "pending"].filter((s) => s !== r.status).map((s) => (
                <button key={s} className="btn ghost" onClick={() => set(r.id, s)}>{s}</button>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}
