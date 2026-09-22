import { createAdminClient } from "@/lib/supabase/admin";
import type { Viewer } from "@/lib/auth";
import { isAdmin as _isAdmin } from "@/lib/perms";
import { activeMembership } from "@/lib/members";

type Admin = ReturnType<typeof createAdminClient>;

export interface AnalyticsRow {
  student_id: string;
  name: string;
  email: string;
  avg_pct: number | null;
  graded_count: number;
  submitted_count: number;
  late_count: number;
  attendance_pct: number | null;
  sessions: number;
}

export async function getAnalytics(admin: Admin, viewer: Viewer, classId: string, opts: { from?: string; to?: string; student_id?: string } = {}) {
  const { data: cls } = await admin.from("classes").select("id,teacher_id").eq("id", classId).is("deleted_at", null).single();
  if (!cls) throw new Error("Class not found.");
  const member = await activeMembership(admin, classId, viewer.id);
  const staff =
    _isAdmin(viewer) || cls.teacher_id === viewer.id ||
    (!!member && (member.role_in_class === "teacher" || member.role_in_class === "assistant"));

  let scopeIds: string[] | null = null;
  if (!staff) {
    if (member?.role_in_class === "student") scopeIds = [viewer.id];
    else if (viewer.profile.role === "parent") {
      const { data: links } = await admin.from("parent_student_links").select("student_id").eq("parent_id", viewer.id).eq("status", "active");
      scopeIds = ((links ?? []) as { student_id: string }[]).map((l) => l.student_id);
      if (!scopeIds.length) return { rows: [], assignments: [], summary: null };
    } else throw new Error("You do not have access to analytics.");
  }

  const { data: students } = await admin.from("class_members").select("user_id").eq("class_id", classId).eq("role_in_class", "student").eq("status", "active").limit(500);
  let sids = ((students ?? []) as { user_id: string }[]).map((s) => s.user_id);
  if (scopeIds) sids = sids.filter((s) => scopeIds!.includes(s));
  if (opts.student_id) {
    if (!staff) throw new Error("Only staff can query other students.");
    sids = sids.filter((s) => s === opts.student_id);
  }
  if (!sids.length) return { rows: [] as AnalyticsRow[], assignments: [], summary: null };

  const { data: profs } = await admin.from("profiles").select("id,full_name,email").in("id", sids);
  const byId = Object.fromEntries(((profs ?? []) as { id: string; full_name: string; email: string }[]).map((p) => [p.id, p]));
  const { data: assignments } = await admin.from("assignments").select("id,title,type,max_points,created_at").eq("class_id", classId).is("deleted_at", null).eq("status", "published").order("created_at", { ascending: true }).limit(200);
  const aids = ((assignments ?? []) as { id: string }[]).map((a) => a.id);

  let grades: { assignment_id: string; student_id: string; score: number; max_points: number }[] = [];
  let subs: { assignment_id: string; student_id: string; status: string }[] = [];
  if (aids.length) {
    const g = await admin.from("grades").select("assignment_id,student_id,score,max_points").in("assignment_id", aids).in("student_id", sids);
    grades = (g.data ?? []) as never[];
    const s = await admin.from("assignment_submissions").select("assignment_id,student_id,status").in("assignment_id", aids).in("student_id", sids);
    subs = (s.data ?? []) as never[];
  }
  let attQ = admin.from("attendance").select("student_id,status").eq("class_id", classId).in("student_id", sids).limit(5000);
  if (opts.from) attQ = attQ.gte("date", opts.from);
  if (opts.to) attQ = attQ.lte("date", opts.to);
  const { data: att } = await attQ;
  const attRows = (att ?? []) as { student_id: string; status: string }[];

  const rows: AnalyticsRow[] = sids.map((sid) => {
    const g = grades.filter((x) => x.student_id === sid);
    const s = subs.filter((x) => x.student_id === sid);
    const a = attRows.filter((x) => x.student_id === sid);
    const avg = g.length ? g.reduce((n, x) => n + (Number(x.score) / Number(x.max_points)) * 100, 0) / g.length : null;
    const present = a.filter((x) => x.status === "present" || x.status === "late").length;
    return {
      student_id: sid, name: byId[sid]?.full_name || "—", email: byId[sid]?.email || "",
      avg_pct: avg === null ? null : Math.round(avg * 10) / 10,
      graded_count: g.length, submitted_count: s.length,
      late_count: s.filter((x) => x.status === "late").length,
      attendance_pct: a.length ? Math.round((present / a.length) * 1000) / 10 : null,
      sessions: a.length,
    };
  });

  const avgs = rows.filter((r) => r.avg_pct !== null).map((r) => r.avg_pct as number);
  const expected = aids.length * sids.length;
  const present = attRows.filter((x) => x.status === "present" || x.status === "late").length;
  return {
    rows,
    assignments: (assignments ?? []).map((a) => {
      const gg = grades.filter((g) => g.assignment_id === (a as { id: string }).id);
      const aa = a as { id: string; title: string; type: string };
      return {
        id: aa.id, title: aa.title, type: aa.type,
        avg_pct: gg.length ? Math.round((gg.reduce((n, g) => n + (Number(g.score) / Number(g.max_points)) * 100, 0) / gg.length) * 10) / 10 : null,
        graded_count: gg.length,
        submitted_count: subs.filter((s) => s.assignment_id === aa.id).length,
      };
    }),
    summary: {
      students: sids.length,
      assignments: aids.length,
      avg_score: avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : null,
      submission_rate: expected ? Math.round((subs.length / expected) * 1000) / 10 : null,
      attendance_rate: attRows.length ? Math.round((present / attRows.length) * 1000) / 10 : null,
    },
  };
}
