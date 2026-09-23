"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { can, isAdmin } from "@/lib/perms";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity";
import { aiConfig, generateQuiz, generateAssignment, suggestGrade, logAI } from "@/lib/ai";
import { checkAIGate } from "@/lib/plan-gate";

const DIFF = ["easy", "medium", "hard"];
const KINDS = ["mcq", "short", "essay"];

export interface QuizDraft {
  title: string;
  topic: string;
  difficulty: string;
  questions: { kind: string; prompt: string; options: string[]; answer: string; points: number }[];
}

function cleanQuestions(qs: unknown, max: number): QuizDraft["questions"] {
  const out: QuizDraft["questions"] = [];
  for (const q of Array.isArray(qs) ? qs : []) {
    if (out.length >= max || !q || typeof q !== "object") break;
    const r = q as Record<string, unknown>;
    if (typeof r.prompt !== "string" || !r.prompt.trim() || !KINDS.includes(r.kind as string)) continue;
    const pts = Math.min(Math.max(parseInt(String(r.points ?? 10), 10) || 10, 1), 100);
    if (r.kind === "mcq") {
      const opts = (Array.isArray(r.options) ? r.options : []).map(String).map((s) => s.slice(0, 500)).filter(Boolean).slice(0, 6);
      if (opts.length < 2 || typeof r.answer !== "string" || !opts.includes(r.answer)) continue;
      out.push({ kind: "mcq", prompt: (r.prompt as string).trim().slice(0, 3000), options: opts, answer: r.answer, points: pts });
    } else {
      out.push({ kind: r.kind as string, prompt: (r.prompt as string).trim().slice(0, 3000), options: [], answer: String(r.answer ?? "").slice(0, 2000), points: pts });
    }
  }
  return out;
}

export async function generateQuizAction(input: { subject: string; topic: string; difficulty: string; count: number; kinds: string[]; class_id?: string }): Promise<QuizDraft> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const cfg = aiConfig();
  if ("error" in cfg) throw new Error(cfg.error);
  await checkAIGate(admin, viewer, "quiz");
  if (!input.subject.trim() || input.subject.trim().length > 80) throw new Error("Subject is required.");
  if (!input.topic.trim() || input.topic.trim().length > 300) throw new Error("Topic is required (max 300 chars).");
  if (!DIFF.includes(input.difficulty)) throw new Error("Invalid difficulty.");
  const n = Math.min(Math.max(Math.floor(input.count) || 5, 1), 20);
  const ks = input.kinds.filter((k) => KINDS.includes(k)).slice(0, 3);
  if (!ks.length) throw new Error("Pick at least one question type.");
  if (input.class_id) {
    const { data: m } = await admin.from("class_members").select("id").eq("class_id", input.class_id).eq("user_id", viewer.id).eq("status", "active").single();
    if (!m && !isAdmin(viewer)) throw new Error("You are not in this class.");
  }
  const { data, prompt_tokens, completion_tokens } = await generateQuiz(cfg, {
    subject: input.subject.trim(), topic: input.topic.trim(), difficulty: input.difficulty, count: n, kinds: ks,
  });
  const d = data as { title?: string; questions?: unknown };
  const questions = cleanQuestions(d.questions, n);
  if (!questions.length) throw new Error("AI returned no usable questions. Please try again.");
  await logAI(admin, { user_id: viewer.id, kind: "quiz", provider: cfg.provider, model: cfg.model, prompt_tokens, completion_tokens });
  return { title: String(d.title ?? `${input.subject} quiz`).slice(0, 200), topic: input.topic.trim(), difficulty: input.difficulty, questions };
}

export async function saveQuizAction(input: { title: string; topic: string; difficulty: string; class_id: string | null; status: string; questions: QuizDraft["questions"] }): Promise<string> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  if (input.title.trim().length < 3 || input.title.trim().length > 200) throw new Error("Title must be 3-200 characters.");
  const qs = cleanQuestions(input.questions, 20);
  if (!qs.length) throw new Error("Add at least one valid question.");
  let cid: string | null = null;
  let st = "personal";
  if (input.class_id) {
    const { data: cls } = await admin.from("classes").select("id,teacher_id").eq("id", input.class_id).single();
    if (!cls) throw new Error("Class not found.");
    if (!isAdmin(viewer) && cls.teacher_id !== viewer.id && !can(viewer, "assignment.create")) {
      throw new Error("Only the class teacher can add class quizzes.");
    }
    cid = input.class_id;
    st = input.status === "published" ? "published" : "draft";
  }
  const { data: quiz, error } = await admin.from("quizzes").insert({
    class_id: cid, title: input.title.trim(), topic: input.topic.trim().slice(0, 300),
    difficulty: DIFF.includes(input.difficulty) ? input.difficulty : "medium",
    source: "ai", status: st, created_by: viewer.id,
  }).select("id").single();
  if (error || !quiz) throw new Error("Something went wrong. Please try again.");
  await admin.from("quiz_questions").insert(qs.map((q, i) => ({ ...q, quiz_id: (quiz as { id: string }).id, position: i })));
  revalidatePath("/dashboard/quizzes");
  return (quiz as { id: string }).id;
}

export async function publishQuizAction(quizId: string): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: quiz } = await admin.from("quizzes").select("id,class_id,created_by").eq("id", quizId).single();
  if (!quiz) throw new Error("Quiz not found.");
  if (quiz.created_by !== viewer.id && !isAdmin(viewer)) {
    if (!quiz.class_id) throw new Error("Only the owner can publish.");
    const { data: cls } = await admin.from("classes").select("teacher_id").eq("id", quiz.class_id as string).single();
    if (cls?.teacher_id !== viewer.id) throw new Error("Only the class teacher can publish.");
  }
  await admin.from("quizzes").update({ status: "published" }).eq("id", quizId);
  revalidatePath(`/dashboard/quizzes/${quizId}`);
}

export async function deleteQuizAction(quizId: string): Promise<void> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: quiz } = await admin.from("quizzes").select("id,class_id,created_by").eq("id", quizId).single();
  if (!quiz) throw new Error("Quiz not found.");
  let teacher = isAdmin(viewer) || quiz.created_by === viewer.id;
  if (quiz.class_id && !teacher) {
    const { data: cls } = await admin.from("classes").select("teacher_id").eq("id", quiz.class_id as string).single();
    teacher = cls?.teacher_id === viewer.id;
  }
  if (quiz.created_by !== viewer.id && !teacher) throw new Error("Only the owner can delete this quiz.");
  await admin.from("quizzes").update({ deleted_at: new Date().toISOString() }).eq("id", quizId);
  redirect("/dashboard/quizzes");
}

export async function submitQuizAction(quizId: string, answers: Record<string, string>): Promise<{ score: number; max: number }> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: quiz } = await admin.from("quizzes").select("*").eq("id", quizId).is("deleted_at", null).single();
  if (!quiz) throw new Error("Quiz not found.");
  const { data: questions } = await admin.from("quiz_questions").select("*").eq("quiz_id", quizId);
  if (!questions?.length) throw new Error("Quiz has no questions.");
  let score = 0, max = 0, mcqTotal = 0, mcqGot = 0;
  const rows = ((questions ?? []) as { id: string; kind: string; points: number; answer: string }[]).map((q) => {
    max += q.points;
    const given = String(answers[q.id] ?? "").slice(0, 5000);
    if (q.kind === "mcq") {
      mcqTotal += q.points;
      const ok = given === q.answer;
      if (ok) { score += q.points; mcqGot += q.points; }
      return { question_id: q.id, answer_text: given, is_correct: ok };
    }
    return { question_id: q.id, answer_text: given, is_correct: null };
  });
  const { data: attempt, error } = await admin.from("quiz_attempts").insert({
    quiz_id: quizId, student_id: viewer.id, score, max_points: max, status: "submitted",
  }).select("id").single();
  if (error || !attempt) throw new Error("Something went wrong. Please try again.");
  await admin.from("quiz_answers").insert(rows.map((r) => ({ ...r, attempt_id: (attempt as { id: string }).id })));
  if (quiz.class_id && mcqTotal > 0 && mcqGot >= mcqTotal) {
    const { awardRule } = await import("@/lib/points-engine");
    awardRule(admin, { class_id: quiz.class_id as string, user_id: viewer.id, code: "perfect_score", dedupe_key: `quiz:${quizId}:${(attempt as { id: string }).id}`, awarded_by: null }).catch(() => {});
  }
  revalidatePath(`/dashboard/quizzes/${quizId}`);
  return { score, max };
}

export async function generateAssignmentDraftAction(input: { subject: string; topic: string; difficulty: string; instructions: string; count: number; type: string }): Promise<{ title: string; description: string; instructions: string; type: string }> {
  const viewer = await requireViewer();
  if (!isAdmin(viewer) && !can(viewer, "assignment.create")) {
    throw new Error("Only teachers can use the assignment generator.");
  }
  const admin = createAdminClient();
  const cfg = aiConfig();
  if ("error" in cfg) throw new Error(cfg.error);
  await checkAIGate(admin, viewer, "assignment");
  if (!input.subject.trim() || input.subject.trim().length > 80) throw new Error("Subject is required.");
  if (!input.topic.trim() || input.topic.trim().length > 300) throw new Error("Topic is required (max 300 chars).");
  if (!DIFF.includes(input.difficulty)) throw new Error("Invalid difficulty.");
  if (input.instructions.length > 2000) throw new Error("Instructions are too long.");
  if (!["guided", "normal"].includes(input.type)) throw new Error("Invalid type.");
  const { data, prompt_tokens, completion_tokens } = await generateAssignment(cfg, {
    subject: input.subject.trim(), topic: input.topic.trim(), difficulty: input.difficulty,
    instructions: input.instructions.trim(), count: Math.min(Math.max(Math.floor(input.count) || 5, 1), 20), type: input.type,
  });
  await logAI(admin, { user_id: viewer.id, kind: "assignment", provider: cfg.provider, model: cfg.model, prompt_tokens, completion_tokens });
  const d = data as { title?: string; description?: string; instructions?: string };
  return {
    title: String(d.title ?? "").slice(0, 200),
    description: String(d.description ?? "").slice(0, 5000),
    instructions: String(d.instructions ?? "").slice(0, 5000),
    type: input.type,
  };
}

export async function suggestGradeAction(assignmentId: string, studentId: string) {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const cfg = aiConfig();
  if ("error" in cfg) throw new Error(cfg.error);
  await checkAIGate(admin, viewer, "grade");
  const { data: asg } = await admin.from("assignments").select("id,class_id,title,max_points").eq("id", assignmentId).is("deleted_at", null).single();
  if (!asg) throw new Error("Assignment not found.");
  const { data: cls } = await admin.from("classes").select("id,teacher_id,subject").eq("id", (asg as { class_id: string }).class_id).single();
  const { data: member } = await admin.from("class_members").select("role_in_class").eq("class_id", (asg as { class_id: string }).class_id).eq("user_id", viewer.id).eq("status", "active").single();
  const staff = isAdmin(viewer) || cls?.teacher_id === viewer.id ||
    (member && ((member as { role_in_class: string }).role_in_class === "teacher" || (member as { role_in_class: string }).role_in_class === "assistant"));
  if (!staff || (!can(viewer, "assignment.grade") && !isAdmin(viewer) && cls?.teacher_id !== viewer.id)) {
    throw new Error("You do not have permission to grade.");
  }
  const { data: sub } = await admin.from("assignment_submissions").select("id,text_content").eq("assignment_id", assignmentId).eq("student_id", studentId).single();
  if (!sub) throw new Error("No submission from this student yet.");
  const { data: files } = await admin.from("submission_files").select("name").eq("submission_id", (sub as { id: string }).id);
  const { data, prompt_tokens, completion_tokens } = await suggestGrade(cfg, {
    subject: (cls as { subject?: string } | null)?.subject ?? "",
    title: (asg as { title: string }).title,
    max_points: (asg as { max_points: number }).max_points,
    answer: ((sub as { text_content: string }).text_content ?? "").slice(0, 8000),
    files: ((files ?? []) as { name: string }[]).map((f) => f.name),
  });
  const d = data as { suggested_score?: number; suggested_feedback?: string; criteria?: string; confidence?: string };
  const score = Math.min(Math.max(Number(d.suggested_score) || 0, 0), (asg as { max_points: number }).max_points);
  const { data: sug, error } = await admin.from("ai_grading_suggestions").insert({
    assignment_id: assignmentId, student_id: studentId, submission_id: (sub as { id: string }).id,
    suggested_score: Math.round(score * 100) / 100,
    suggested_feedback: String(d.suggested_feedback ?? "").slice(0, 2000),
    criteria: String(d.criteria ?? "").slice(0, 2000),
    confidence: ["low", "medium", "high"].includes(d.confidence ?? "") ? d.confidence : "medium",
  }).select().single();
  if (error || !sug) throw new Error("Something went wrong. Please try again.");
  await logAI(admin, { user_id: viewer.id, kind: "grade", provider: cfg.provider, model: cfg.model, prompt_tokens, completion_tokens });
  revalidatePath(`/dashboard/assignments/${assignmentId}`);
  return sug as { id: string };
}

export async function resolveSuggestionAction(suggestionId: string, input: { decision: string; score?: number; feedback?: string }): Promise<{ source?: string }> {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const { data: sug } = await admin.from("ai_grading_suggestions").select("*").eq("id", suggestionId).single();
  if (!sug) throw new Error("Suggestion not found.");
  const s = sug as { status: string; assignment_id: string; student_id: string; suggested_score: number; suggested_feedback: string };
  if (s.status !== "pending") throw new Error(`Suggestion is already ${s.status}.`);
  const { data: asg } = await admin.from("assignments").select("id,class_id,max_points").eq("id", s.assignment_id).single();
  const a = asg as { id: string; class_id: string; max_points: number };
  const { data: cls } = await admin.from("classes").select("teacher_id").eq("id", a.class_id).single();
  const { data: member } = await admin.from("class_members").select("role_in_class").eq("class_id", a.class_id).eq("user_id", viewer.id).eq("status", "active").single();
  const m = member as { role_in_class: string } | null;
  const staff = isAdmin(viewer) || (cls as { teacher_id: string } | null)?.teacher_id === viewer.id ||
    (!!m && (m.role_in_class === "teacher" || m.role_in_class === "assistant"));
  if (!staff || (!can(viewer, "assignment.grade") && !isAdmin(viewer) && (cls as { teacher_id: string } | null)?.teacher_id !== viewer.id)) {
    throw new Error("You do not have permission to grade.");
  }
  if (!["approve", "modify", "reject"].includes(input.decision)) throw new Error("Invalid decision.");
  if (input.decision === "reject") {
    await admin.from("ai_grading_suggestions").update({ status: "rejected", resolved_by: viewer.id, resolved_at: new Date().toISOString() }).eq("id", suggestionId);
    await logActivity(admin, viewer, "ai.suggestion_reject", "assignment", a.id, { suggestion_id: suggestionId });
    revalidatePath(`/dashboard/assignments/${a.id}`);
    return {};
  }
  let final: { score: number; feedback: string };
  let source: string;
  if (input.decision === "approve") {
    final = { score: s.suggested_score, feedback: s.suggested_feedback };
    source = "ai_approved";
  } else {
    const num = Number(input.score);
    if (!Number.isFinite(num) || num < 0 || num > a.max_points) throw new Error(`Score must be 0–${a.max_points}.`);
    if ((input.feedback ?? "").length > 2000) throw new Error("Feedback is too long.");
    final = { score: Math.round(num * 100) / 100, feedback: (input.feedback ?? "").trim() };
    source = "ai_modified";
  }
  await admin.from("grades").upsert({
    assignment_id: a.id, student_id: s.student_id, score: final.score, max_points: a.max_points,
    feedback: final.feedback, graded_by: viewer.id, grading_source: source,
  }, { onConflict: "assignment_id,student_id" });
  await admin.from("assignment_submissions").update({ status: "graded" }).eq("assignment_id", a.id).eq("student_id", s.student_id);
  await admin.from("ai_grading_suggestions").update({ status: input.decision === "approve" ? "approved" : "modified", resolved_by: viewer.id, resolved_at: new Date().toISOString() }).eq("id", suggestionId);
  await logActivity(admin, viewer, "grade.change", "assignment", a.id, { student_id: s.student_id, source });
  revalidatePath(`/dashboard/assignments/${a.id}`);
  return { source };
}
