import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { myClassIds } from "@/lib/classes";

export interface CalItem {
  kind: string;
  id: string;
  class_id: string;
  class_name: string;
  title: string;
  start: string;
  end: string | null;
  link: string;
}

const KIND_COLOR: Record<string, string> = { session: "#2563eb", event: "#0ea5e9", exam: "#d97706", deadline: "#dc2626" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { ym } = await searchParams;
  const base = ym && /^\d{4}-\d{2}$/.test(ym) ? new Date(`${ym}-01T00:00:00`) : new Date();
  const y = base.getFullYear(), m = base.getMonth();
  const from = new Date(y, m, 1).toISOString();
  const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString();

  const classIds = await myClassIds(admin, viewer);
  let items: CalItem[] = [];
  if (classIds.length) {
    const { data: classes } = await admin.from("classes").select("id,name").in("id", classIds);
    const names = Object.fromEntries(((classes ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    const { data: sessions } = await admin.from("sessions").select("id,class_id,title,start_at,end_at,meeting_url").in("class_id", classIds).is("deleted_at", null).gte("start_at", from).lte("start_at", to).limit(500);
    ((sessions ?? []) as Record<string, string>[]).forEach((s) => items.push({ kind: "session", id: s.id, class_id: s.class_id, class_name: names[s.class_id] ?? "", title: s.title, start: s.start_at, end: s.end_at, link: s.meeting_url ?? "" }));
    const { data: events } = await admin.from("calendar_events").select("id,class_id,title,type,start_at,end_at,link").in("class_id", classIds).gte("start_at", from).lte("start_at", to).limit(500);
    ((events ?? []) as Record<string, string>[]).forEach((e) => items.push({ kind: e.type === "exam" ? "exam" : "event", id: e.id, class_id: e.class_id, class_name: names[e.class_id] ?? "", title: e.title, start: e.start_at, end: e.end_at, link: e.link ?? "" }));
    const { data: asgs } = await admin.from("assignments").select("id,class_id,title,due_date").in("class_id", classIds).is("deleted_at", null).eq("status", "published").not("due_date", "is", null).gte("due_date", from).lte("due_date", to).limit(500);
    ((asgs ?? []) as Record<string, string>[]).forEach((a) => items.push({ kind: "deadline", id: a.id, class_id: a.class_id, class_name: names[a.class_id] ?? "", title: `Due: ${a.title}`, start: a.due_date, end: a.due_date, link: "" }));
    items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  const monthName = new Date(y, m, 1).toLocaleString("en", { month: "long", year: "numeric" });
  const startPad = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(startPad).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const prevYm = m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, "0")}`;
  const nextYm = m === 11 ? `${y + 1}-01` : `${y}-${String(m + 2).padStart(2, "0")}`;

  const byDay: Record<string, CalItem[]> = {};
  items.forEach((it) => {
    const k = new Date(it.start).toISOString().slice(0, 10);
    (byDay[k] = byDay[k] || []).push(it);
  });
  const upcoming = items.filter((it) => new Date(it.start).getTime() >= Date.now() - 86400000).slice(0, 20);

  return (
    <>
      <section className="card" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link className="btn secondary" href={`/dashboard/calendar?ym=${prevYm}`}>←</Link>
        <h2 style={{ margin: 0, flex: 1, textAlign: "center" }}>{monthName}</h2>
        <Link className="btn secondary" href={`/dashboard/calendar?ym=${nextYm}`}>→</Link>
      </section>
      <section className="card">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <b key={d} style={{ fontSize: 12, color: "var(--muted)" }}>{d}</b>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const list = (byDay[key] ?? []).slice(0, 3);
            return (
              <div key={i} style={{ minHeight: 88, border: "1px solid var(--border)", borderRadius: 8, padding: 4, fontSize: 12 }}>
                <b>{d}</b>
                {list.map((it) => (
                  <div key={it.kind + it.id} title={it.title} style={{ borderLeft: `3px solid ${KIND_COLOR[it.kind] ?? "#64748b"}`, paddingLeft: 4, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                ))}
                {(byDay[key] ?? []).length > 3 ? <div style={{ color: "var(--muted)" }}>+{(byDay[key] ?? []).length - 3} more</div> : null}
              </div>
            );
          })}
        </div>
      </section>
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Upcoming</h3>
        {upcoming.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>What</th><th>Class</th></tr></thead>
            <tbody>
              {upcoming.map((it) => (
                <tr key={it.kind + it.id}>
                  <td>{new Date(it.start).toLocaleString()}</td>
                  <td><span className="badge">{it.kind}</span> {it.link ? <a href={it.link} target="_blank" rel="noopener">{it.title}</a> : it.title}</td>
                  <td>{it.class_name}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <div className="empty">Nothing upcoming.</div>}
      </section>
    </>
  );
}
