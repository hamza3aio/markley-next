"use client";

import { useEffect, useRef, useState } from "react";
import { getAnalytics } from "./analytics-actions";
import type { AnalyticsRow } from "@/lib/analytics";

interface AsgAvg { id: string; title: string; avg_pct: number | null; }

export function AnalyticsSection({ classId, canExport }: { classId: string; canExport: boolean }) {
  const [data, setData] = useState<{ rows: AnalyticsRow[]; assignments: AsgAvg[]; summary: { students: number; avg_score: number | null; submission_rate: number | null; attendance_rate: number | null } | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    getAnalytics(classId).then(setData).catch((e) => setErr(e instanceof Error ? e.message : "Load failed."));
  }, [classId]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    let chart: { destroy: () => void } | null = null;
    import("chart.js/auto").then((mod) => {
      if (!canvasRef.current) return;
      const Chart = mod.default;
      chart = new Chart(canvasRef.current, {
        type: "bar",
        data: {
          labels: data.assignments.map((x) => x.title.slice(0, 24)),
          datasets: [{ data: data.assignments.map((x) => x.avg_pct ?? 0) }],
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } },
      });
    }).catch(() => {});
    return () => { chart?.destroy(); };
  }, [data]);

  function download(type: string) {
    window.location.href = `/dashboard/classes/${classId}/export?type=${type}`;
  }

  if (err) return <section className="card"><h3 style={{ marginTop: 0 }}>Analytics</h3><div className="empty">{err}</div></section>;
  if (!data) return <section className="card"><h3 style={{ marginTop: 0 }}>Analytics</h3><div className="loading">Loading analytics…</div></section>;
  if (!data.summary) return <section className="card"><h3 style={{ marginTop: 0 }}>Analytics</h3><div className="empty">No data yet.</div></section>;
  const s = data.summary;
  return (
    <section className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Analytics</h3>
        <div className="spacer" />
        {canExport ? (
          <>
            <button className="btn secondary" onClick={() => download("grades")}>Grades .xlsx</button>
            <button className="btn secondary" onClick={() => download("attendance")}>Attendance .xlsx</button>
            <button className="btn secondary" onClick={() => download("report")}>Full report</button>
          </>
        ) : null}
      </div>
      <section className="grid cols-4" style={{ marginTop: 12 }}>
        <div className="card stat"><div className="num">{s.avg_score ?? "—"}</div><div className="lbl">Avg score %</div></div>
        <div className="card stat"><div className="num">{s.submission_rate ?? "—"}%</div><div className="lbl">Submission rate</div></div>
        <div className="card stat"><div className="num">{s.attendance_rate ?? "—"}%</div><div className="lbl">Attendance rate</div></div>
        <div className="card stat"><div className="num">{s.students}</div><div className="lbl">Students</div></div>
      </section>
      <div className="card" style={{ marginTop: 12 }}>
        <h4 style={{ marginTop: 0 }}>Average score per assignment</h4>
        <canvas ref={canvasRef} height={120} />
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}><table>
        <thead><tr><th>Student</th><th>Avg %</th><th>Graded</th><th>Submitted</th><th>Late</th><th>Attendance</th></tr></thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.student_id}>
              <td>{r.name}</td><td>{r.avg_pct ?? "—"}</td><td>{r.graded_count}</td>
              <td>{r.submitted_count}</td><td>{r.late_count}</td>
              <td>{r.attendance_pct ?? "—"}{r.attendance_pct !== null ? "%" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </section>
  );
}
