"use client";

import { useEffect, useState } from "react";
import { getNotificationsAction, markNotificationsAction, type Notification } from "./notifications-actions";

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  async function refresh() {
    try {
      const r = await getNotificationsAction();
      setItems(r.notifications);
      setUnread(r.unread);
    } catch {
      // offline-safe
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 120000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <button className="btn secondary" aria-label="Notifications" onClick={() => { setOpen((o) => !o); if (!open) refresh(); }}>
        🔔 {unread ? <span className="badge danger">{Math.min(unread, 99)}</span> : null}
      </button>
      {open ? (
        <div className="card" style={{ position: "absolute", right: 0, top: 44, width: "min(360px,90vw)", maxHeight: "60vh", overflow: "auto", zIndex: 50 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <b>Notifications</b>
            <div className="spacer" />
            {unread ? <button className="btn secondary" onClick={() => markNotificationsAction("all").then(refresh)}>Mark all read</button> : null}
          </div>
          {items.length ? items.map((n) => (
            <div key={n.id} style={{ padding: 8, borderTop: "1px solid var(--border)", opacity: n.read_at ? 0.65 : 1 }}>
              <div><b>{n.title}</b></div>
              {n.body ? <div style={{ fontSize: 13, color: "var(--muted)" }}>{n.body}</div> : null}
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{new Date(n.created_at).toLocaleString()}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {n.link && n.link.startsWith("/") ? <a href={n.link}>Open</a> : null}
                {!n.read_at ? <a href="#" onClick={(e) => { e.preventDefault(); markNotificationsAction([n.id]).then(refresh); }}>Mark read</a> : null}
              </div>
            </div>
          )) : <div className="empty">No notifications.</div>}
        </div>
      ) : null}
    </div>
  );
}
