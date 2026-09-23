import type { SupabaseClient } from "@supabase/supabase-js";

export interface AiConfig {
  apiKey: string;
  base: string;
  model: string;
  provider: string;
}

export function aiConfig(): AiConfig | { error: string } {
  const apiKey = process.env.AI_API_KEY ?? "";
  const base = (process.env.AI_API_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.AI_MODEL || "gpt-4o-mini";
  const provider = process.env.AI_PROVIDER || "openai-compatible";
  if (!apiKey) return { error: "AI is not configured. Set AI_API_KEY on the server." };
  return { apiKey, base, model, provider };
}

async function chatJSON(cfg: AiConfig, system: string, user: string, maxTokens = 2000) {
  const r = await fetch(`${cfg.base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body?.error?.message || "AI provider error. Please try again.");
  const text = body?.choices?.[0]?.message?.content ?? "";
  const usage = body?.usage ?? {};
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("AI returned an invalid response. Please try again.");
  }
  return { data, prompt_tokens: usage.prompt_tokens ?? null, completion_tokens: usage.completion_tokens ?? null };
}

export async function logAI(
  admin: SupabaseClient,
  args: { user_id: string; kind: string; provider: string; model: string; prompt_tokens: number | null; completion_tokens: number | null }
): Promise<void> {
  try {
    await admin.from("ai_requests").insert(args);
  } catch {
    // never breaks the request
  }
}

const QUIZ_SYS = `You generate IGCSE quizzes. Reply with JSON ONLY in this shape:
{"title": string, "questions": [{"kind": "mcq"|"short"|"essay", "prompt": string, "options": [string] (mcq only, 4 items), "answer": string (mcq: exact correct option; short: model answer; essay: marking points), "points": number}]}
Keep prompts curriculum-accurate, English only, no invented mark schemes.`;

export async function generateQuiz(cfg: AiConfig, args: { subject: string; topic: string; difficulty: string; count: number; kinds: string[] }) {
  return chatJSON(cfg, QUIZ_SYS, `Subject: ${args.subject}\nTopic: ${args.topic}\nDifficulty: ${args.difficulty}\nQuestions: ${args.count}\nAllowed types: ${args.kinds.join(", ")}\nSyllabus: Cambridge IGCSE level.`, 3000);
}

const ASG_SYS = `You draft IGCSE assignments for teachers. Reply with JSON ONLY:
{"title": string, "description": string, "instructions": string}
English only, curriculum-accurate, age-appropriate for teenagers. Never invent official mark schemes.`;

export async function generateAssignment(cfg: AiConfig, args: { subject: string; topic: string; difficulty: string; instructions: string; count: number; type: string }) {
  return chatJSON(cfg, ASG_SYS, `Subject: ${args.subject}\nTopic: ${args.topic}\nDifficulty: ${args.difficulty}\nTeacher instructions: ${args.instructions}\nQuestions/tasks: ${args.count}\nAssignment type: ${args.type}`, 2000);
}

const GRADE_SYS = `You assist grading IGCSE work. Reply with JSON ONLY:
{"suggested_score": number (0 to max), "max_points": number, "suggested_feedback": string (constructive, English), "criteria": string (what was assessed), "confidence": "low"|"medium"|"high"}
Be fair and conservative. Your output is a SUGGESTION for a teacher, never final.`;

export async function suggestGrade(cfg: AiConfig, args: { subject: string; title: string; max_points: number; answer: string; files: string[] }) {
  return chatJSON(cfg, GRADE_SYS, `Assignment: ${args.title}\nSubject: ${args.subject}\nMax points: ${args.max_points}\nStudent written answer:\n${args.answer || "(none)"}\nAttached files (names only, content not visible):\n${args.files.join("\n") || "(none)"}`, 1500);
}
