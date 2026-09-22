"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSessionAction, deleteSessionAction, createEventAction } from "./schedule-actions";

export interface SessionItem {
  id: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  meeting_url: string;
  provider: string;
}

export interface EventItem {
  id: string;
  title: string;
  type: string;
  start_at: string;
  link: string;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function SessionsSection({ classId, sessions, isStaff }: { classId: string; sessions: SessionItem[]; isStaff: boolean }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = Date.now();

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      await createSessionAction(classId, {
        title: String(fd.get("title") ?? ""),
        description: String(fd.get("description") ?? ""),
        start_at: new Date(String(fd.get("start") ?? "")).toISOString(),
        end_at: new Date(String(fd.get("end") ?? "")).toISOString(),
        meeting_url: String(fd.get("url") ?? ""),
        provider: String(fd.get("provider") ?? "other"),
      });
      setShowNew(false);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this session?")) return;
    try {
      await deleteSessionAction(id, classId);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  const start = new Date(Date.now() + 3600000);
  const end = new Date(Date.now() + 2 * 3600000);

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Live sessions</h3>
        <div className="spacer" />
        {isStaff ? <button className="btn" onClick={() => setShowNew((s) => !s)}>New session</button> : null}
      </div>
      {msg ? <p>{msg}</p> : null}
      {showNew ? (
        <form onSubmit={create} className="form" style={{ marginTop: 12 }}>
          <label className="field">Title<input className="input" name="title" required minLength={3} maxLength={200} /></label>
          <label className="field">Description<textarea className="input" name="description" rows={2} maxLength={2000} /></label>
          <div className="grid cols-3">
            <label className="field">Starts<input className="input" name="start" type="datetime-local" required defaultValue={toLocalInput(start.toISOString())} /></label>
            <label className="field">Ends<input className="input" name="end" type="datetime-local" required defaultValue={toLocalInput(end.toISOString())} /></label>
            <label className="field">Provider
              <select className="input" name="provider" defaultValue="zoom">
                <option value="zoom">Zoom</option>
                <option value="teams">Microsoft Teams</option>
                <option value="meet">Google Meet</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <label className="field">Meeting link (https://)<input className="input" name="url" type="url" placeholder="https://…" /></label>
          <div><button className="btn" type="submit" disabled={busy}>{busy ? "Creating…" : "Create"} — members are notified</button></div>
        </form>
      ) : null}
      <div style={{ marginTop: 8 }}>
        {sessions.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Session</th><th>Starts</th><th>Provider</th><th></th></tr></thead>
            <tbody>
              {sessions.map((s) => {
                const live = new Date(s.start_at).getTime() <= now && now <= new Date(s.end_at).getTime();
                return (
                  <tr key={s.id}>
                    <td>{s.title} {live ? <span className="badge success">live now</span> : null}<br /><small style={{ color: "var(--muted)" }}>{s.description}</small></td>
                    <td>{new Date(s.start_at).toLocaleString()}</td>
                    <td>{s.provider}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {s.meeting_url ? <a className="btn" href={s.meeting_url} target="_blank" rel="noopener">Join session</a> : <span style={{ color: "var(--muted)" }}>No link</span>}
                      {isStaff ? <> <button className="btn ghost" onClick={() => remove(s.id)}>Delete</button></> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        ) : <div className="empty">No sessions scheduled.</div>}
      </div>
    </section>
  );
}

export function EventsSection({ classId, events, isStaff }: { classId: string; events: EventItem[]; isStaff: boolean }) {
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const endRaw = String(fd.get("end") ?? "");
      await createEventAction(classId, {
        title: String(fd.get("title") ?? ""),
        description: String(fd.get("description") ?? ""),
        type: String(fd.get("type") ?? "event"),
        start_at: new Date(String(fd.get("start") ?? "")).toISOString(),
        end_at: endRaw ? new Date(endRaw).toISOString() : null,
        link: String(fd.get("link") ?? ""),
      });
      setShowNew(false);
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Create failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Events</h3>
        <div className="spacer" />
        {isStaff ? <button className="btn secondary" onClick={() => setShowNew((s) => !s)}>New event</button> : null}
      </div>
      {msg ? <p>{msg}</p> : null}
      {showNew ? (
        <form onSubmit={create} className="form" style={{ marginTop: 12 }}>
          <label className="field">Title<input className="input" name="title" required minLength={3} maxLength={200} /></label>
          <div className="grid cols-3">
            <label className="field">Type
              <select className="input" name="type" defaultValue="event">
                <option value="event">Event</option>
                <option value="exam">Exam</option>
                <option value="deadline">Deadline</option>
              </select>
            </label>
            <label className="field">Starts<input className="input" name="start" type="datetime-local" required /></label>
            <label className="field">Ends (optional)<input className="input" name="end" type="datetime-local" /></label>
          </div>
          <label className="field">Link (optional)<input className="input" name="link" type="url" placeholder="https://…" /></label>
          <label className="field">Description<textarea className="input" name="description" rows={2} maxLength={2000} /></label>
          <div><button className="btn secondary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</button></div>
        </form>
      ) : null}
      <div style={{ marginTop: 8 }}>
        {events.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Event</th><th>Type</th><th>Starts</th><th></th></tr></thead>
            <tbody>
              {events.map((v) => (
                <tr key={v.id}>
                  <td>{v.title}</td>
                  <td><span className="badge">{v.type}</span></td>
                  <td>{new Date(v.start_at).toLocaleString()}</td>
                  <td>{v.link ? <a href={v.link} target="_blank" rel="noopener">Open</a> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <div className="empty">No events.</div>}
      </div>
    </section>
  );
}
