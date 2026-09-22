"use client";

import { useState } from "react";
import { markAttendanceAction, getAttendanceAction } from "./attendance-actions";

interface Member {
  user_id: string;
  name: string;
}

export function AttendanceSection({ classId, isStaff, students }: { classId: string; isStaff: boolean; students: Member[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<Record<string, string>>({});
  const [records, setRecords] = useState<{ student_id: string; date: string; status: string }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(d: string, forMark = false) {
    setMsg(null);
    try {
      const recs = await getAttendanceAction(classId, forMark ? d : "", forMark ? d : "");
      if (forMark) {
        const map: Record<string, string> = {};
        students.forEach((s) => { map[s.user_id] = "present"; });
        recs.forEach((r) => { map[r.student_id] = r.status; });
        setRows(map);
      } else {
        setRecords(recs);
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Load failed.");
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const recs = students.map((s) => ({ student_id: s.user_id, status: rows[s.user_id] ?? "present" }));
      const { count } = await markAttendanceAction(classId, date, recs);
      setMsg(`Saved ${count} records.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!isStaff) {
    return (
      <section className="card">
        <h3 style={{ marginTop: 0 }}>Attendance</h3>
        <button className="btn secondary" onClick={() => load("")}>Show my attendance</button>
        {msg ? <p>{msg}</p> : null}
        {records ? (
          records.length ? (
            <>
              <p><b>Attendance: {Math.round((records.filter((r) => r.status === "present" || r.status === "late").length / records.length) * 1000) / 10}%</b></p>
              <div className="table-wrap"><table>
                <thead><tr><th>Date</th><th>Status</th></tr></thead>
                <tbody>{records.slice(0, 60).map((r, i) => <tr key={i}><td>{r.date}</td><td><span className="badge">{r.status}</span></td></tr>)}</tbody>
              </table></div>
            </>
          ) : <div className="empty">No attendance records yet.</div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Attendance</h3>
        <div className="spacer" />
        <input className="input" style={{ width: "auto" }} type="date" value={date} max={today} onChange={(e) => { setDate(e.target.value); load(e.target.value, true); }} />
        <button className="btn secondary" onClick={() => load(date, true)}>Load day</button>
      </div>
      {msg ? <p>{msg}</p> : null}
      {!students.length ? <div className="empty">No students enrolled.</div> : (
        <>
          <div className="table-wrap" style={{ marginTop: 8 }}><table>
            <thead><tr><th>Student</th><th>Status on {date}</th></tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.user_id}>
                  <td>{s.name}</td>
                  <td>
                    <select className="input" value={rows[s.user_id] ?? "present"} onChange={(e) => setRows((r) => ({ ...r, [s.user_id]: e.target.value }))}>
                      {["present", "absent", "late", "excused"].map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <button className="btn" style={{ marginTop: 8 }} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save attendance"}</button>
        </>
      )}
    </section>
  );
}
