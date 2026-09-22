import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExamMeta } from "./actions";
import { NewExamForm } from "./forms";

const SESSIONS = ["Feb/March", "May/June", "Oct/Nov"];

export default async function ExamsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const sp = await searchParams;
  const page = Math.max(0, parseInt(sp.page ?? "0", 10) || 0);
  const limit = 25;

  const { subjects, boards } = await getExamMeta();
  let q = admin.from("exams").select("*", { count: "exact" }).order("year", { ascending: false }).order("created_at", { ascending: false }).range(page * limit, page * limit + limit - 1);
  if (sp.subject) q = q.eq("subject_code", sp.subject);
  if (sp.board) q = q.eq("board_code", sp.board);
  if (sp.year && Number.isInteger(Number(sp.year))) q = q.eq("year", Number(sp.year));
  if (sp.session && SESSIONS.includes(sp.session)) q = q.eq("session", sp.session);
  if (sp.paper) q = q.ilike("paper", `%${sp.paper.slice(0, 60)}%`);
  if (sp.search?.trim()) {
    const s = sp.search.trim().slice(0, 80);
    q = q.or(`title.ilike.%${s}%,paper.ilike.%${s}%`);
  }
  const { data: exams, count } = await q;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));
  const canManage = isAdmin(viewer) || can(viewer, "exams.manage");
  const years: number[] = [];
  for (let y = new Date().getFullYear() + 1; y >= 2015; y--) years.push(y);
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v) p.set(k, v);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/dashboard/exams?${p.toString()}`;
  };
  const sName = (c: string) => subjects.find((s) => s.code === c)?.name ?? c;
  const bName = (c: string) => boards.find((b) => b.code === c)?.name ?? c;

  return (
    <>
      <section className="card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Exams & mark schemes</h2>
          <p style={{ color: "var(--muted)", margin: 0 }}>{total} paper{total === 1 ? "" : "s"}</p>
        </div>
        <div className="spacer" />
        {canManage ? <Link className="btn" href="/dashboard/exams?new=1">Add exam</Link> : null}
      </section>
      {canManage && sp.new === "1" ? <NewExamForm subjects={subjects} boards={boards} /> : null}
      <section className="card">
        <form method="get" className="form">
          <div className="grid cols-3">
            <label className="field">Search<input className="input" name="search" defaultValue={sp.search ?? ""} placeholder="Title or paper" /></label>
            <label className="field">Subject
              <select className="input" name="subject" defaultValue={sp.subject ?? ""}>
                <option value="">All subjects</option>
                {subjects.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </label>
            <label className="field">Board
              <select className="input" name="board" defaultValue={sp.board ?? ""}>
                <option value="">All boards</option>
                {boards.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
            </label>
            <label className="field">Year
              <select className="input" name="year" defaultValue={sp.year ?? ""}>
                <option value="">All years</option>
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
            <label className="field">Session
              <select className="input" name="session" defaultValue={sp.session ?? ""}>
                <option value="">All sessions</option>
                {SESSIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="field">Paper<input className="input" name="paper" defaultValue={sp.paper ?? ""} placeholder="e.g. Paper 2" /></label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn secondary" type="submit">Filter</button>
            <Link className="btn ghost" href="/dashboard/exams">Clear</Link>
          </div>
        </form>
      </section>
      <section className="card">
        {(exams ?? []).length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Paper</th><th>Subject</th><th>Board</th><th>Year</th><th>Session</th><th></th></tr></thead>
            <tbody>
              {((exams ?? []) as Record<string, never>[]).map((e) => (
                <tr key={e.id as string}>
                  <td>{(e.title as string) || (e.paper as string)}<br /><small style={{ color: "var(--muted)" }}>{e.paper as string}</small></td>
                  <td>{sName(e.subject_code as string)}</td>
                  <td>{bName(e.board_code as string)}</td>
                  <td>{e.year as number}</td>
                  <td>{e.session as string}</td>
                  <td>{(e.question_name as string) || (e.markscheme_name as string) ? <span className="badge success">files</span> : <span className="badge">meta only</span>} <Link className="btn secondary" href={`/dashboard/exams/${e.id as string}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <div className="empty">No papers match these filters.</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          {page > 0 ? <Link className="btn secondary" href={qs({ page: String(page - 1) })}>← Prev</Link> : null}
          <span style={{ color: "var(--muted)" }}>Page {page + 1} of {pages}</span>
          {page + 1 < pages ? <Link className="btn secondary" href={qs({ page: String(page + 1) })}>Next →</Link> : null}
        </div>
      </section>
    </>
  );
}
