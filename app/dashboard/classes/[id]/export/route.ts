import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth";
import { getClassAccess } from "@/lib/classes";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const type = new URL(request.url).searchParams.get("type") ?? "report";
  if (!["grades", "attendance", "report"].includes(type)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  await createClient();
  const viewer = await getViewer();
  if (!viewer) return Response.json({ error: "Not authenticated." }, { status: 401 });
  if (!viewer.permissions.includes("reports.export") && viewer.profile.role !== "admin") {
    return Response.json({ error: "You do not have permission to export reports." }, { status: 403 });
  }
  const admin = createAdminClient();
  const access = await getClassAccess(admin, viewer, id);
  if (!access) return Response.json({ error: "Class not found." }, { status: 404 });
  const member = access.member;
  const staff =
    viewer.profile.role === "admin" || access.cls.teacher_id === viewer.id ||
    (!!member && (member.role_in_class === "teacher" || member.role_in_class === "assistant"));
  if (!staff) return Response.json({ error: "Only class staff can export." }, { status: 403 });

  const { data: students } = await admin.from("class_members").select("user_id").eq("class_id", id).eq("role_in_class", "student").eq("status", "active").limit(500);
  const sids = ((students ?? []) as { user_id: string }[]).map((s) => s.user_id);
  const { data: profs } = sids.length ? await admin.from("profiles").select("id,full_name,email").in("id", sids) : { data: [] };
  const byId = Object.fromEntries((((profs ?? []) as { id: string; full_name: string; email: string }[])).map((p) => [p.id, p]));
  const { data: assignments } = await admin.from("assignments").select("id,title,max_points").eq("class_id", id).is("deleted_at", null).eq("status", "published").order("created_at", { ascending: true }).limit(200);
  const aids = ((assignments ?? []) as { id: string }[]).map((a) => a.id);
  let grades: { assignment_id: string; student_id: string; score: number; max_points: number }[] = [];
  let subs: { assignment_id: string; student_id: string; status: string }[] = [];
  let att: { student_id: string; status: string }[] = [];
  if (sids.length && aids.length) {
    const g = await admin.from("grades").select("assignment_id,student_id,score,max_points").in("assignment_id", aids).in("student_id", sids);
    grades = (g.data ?? []) as never[];
    const s = await admin.from("assignment_submissions").select("assignment_id,student_id,status").in("assignment_id", aids).in("student_id", sids);
    subs = (s.data ?? []) as never[];
  }
  if (sids.length) {
    const a = await admin.from("attendance").select("student_id,status").eq("class_id", id).in("student_id", sids).limit(5000);
    att = (a.data ?? []) as never[];
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Markley";
  wb.created = new Date();
  const gMap: Record<string, number> = {};
  grades.forEach((g) => { gMap[`${g.student_id}:${g.assignment_id}`] = Number(g.score); });
  const aMap: Record<string, string[]> = {};
  att.forEach((a) => { (aMap[a.student_id] = aMap[a.student_id] || []).push(a.status); });
  const row = (sid: string) => {
    const g = grades.filter((x) => x.student_id === sid);
    const avg = g.length ? g.reduce((n, x) => n + (Number(x.score) / Number(x.max_points)) * 100, 0) / g.length : null;
    const recs = aMap[sid] || [];
    const pres = recs.filter((x) => x === "present" || x === "late").length;
    return { avg, attPct: recs.length ? (pres / recs.length) * 100 : null, late: subs.filter((x) => x.student_id === sid && x.status === "late").length };
  };

  if (type === "grades" || type === "report") {
    const ws = wb.addWorksheet(type === "grades" ? "Grades" : "Report");
    ws.addRow(["Student", "Email", ...((assignments ?? []) as { title: string }[]).map((a) => a.title), "Average %", ...(type === "report" ? ["Late", "Attendance %"] : [])]);
    sids.forEach((sid) => {
      const r = row(sid);
      ws.addRow([
        byId[sid]?.full_name || "—", byId[sid]?.email || "",
        ...((assignments ?? []) as { id: string }[]).map((a) => gMap[`${sid}:${a.id}`] ?? ""),
        r.avg === null ? "" : Math.round(r.avg * 10) / 10,
        ...(type === "report" ? [r.late, r.attPct === null ? "" : Math.round(r.attPct * 10) / 10] : []),
      ]);
    });
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => { c.width = 22; });
  }
  if (type === "attendance") {
    const ws = wb.addWorksheet("Attendance");
    ws.addRow(["Student", "Email", "Present/Late", "Sessions", "Attendance %"]);
    sids.forEach((sid) => {
      const recs = aMap[sid] || [];
      const pres = recs.filter((x) => x === "present" || x === "late").length;
      ws.addRow([byId[sid]?.full_name || "—", byId[sid]?.email || "", pres, recs.length, recs.length ? Math.round((pres / recs.length) * 1000) / 10 : ""]);
    });
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => { c.width = 22; });
  }

  const buf = await wb.xlsx.writeBuffer();
  const safe = access.cls.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "class";
  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="markley-${type}-${safe}.xlsx"`,
    },
  });
}
