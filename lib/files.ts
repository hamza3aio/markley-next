import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

const BLOCKED_EXT = new Set(["exe","bat","cmd","com","scr","msi","js","mjs","html","htm","php","sh","ps1","dll","so","dylib"]);

export const PURPOSE = {
  content: { bucket: "class-files", maxBytes: 52428800, mimes: new Set([
    "application/pdf","image/jpeg","image/png","image/webp","image/gif",
    "video/mp4","video/webm","text/plain","text/csv",
    "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ])},
  assignment: { bucket: "assignment-files", maxBytes: 26214400, mimes: new Set([
    "application/pdf","image/jpeg","image/png","image/webp","image/gif",
    "text/plain","application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ])},
  submission: { bucket: "assignment-files", maxBytes: 26214400, mimes: new Set([
    "application/pdf","image/jpeg","image/png","image/webp","image/gif",
    "text/plain","application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ])},
  exam_question: { bucket: "exam-files", maxBytes: 26214400, mimes: new Set(["application/pdf"]) },
  exam_resource: { bucket: "exam-files", maxBytes: 26214400, mimes: new Set([
    "application/pdf","image/jpeg","image/png","image/webp",
    "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ])},
} as const;

export type Purpose = keyof typeof PURPOSE;

export function sanitizeName(name: string): string {
  return String(name ?? "").replace(/[/\\<>:"|?*\x00-\x1f]/g, "").trim().slice(0, 255);
}

export function validateFile(purpose: Purpose, name: string, mime: string, size: number): string | null {
  const cfg = PURPOSE[purpose];
  const clean = sanitizeName(name);
  if (!clean) return "File name is required.";
  const ext = (clean.split(".").pop() ?? "").toLowerCase();
  if (!ext || BLOCKED_EXT.has(ext)) return "File type is not allowed.";
  if (!cfg.mimes.has(mime as never)) return "File type is not allowed.";
  if (!Number.isInteger(size) || size <= 0 || size > cfg.maxBytes) {
    return `File must be 1 byte to ${Math.round(cfg.maxBytes / 1048576)} MB.`;
  }
  return null;
}

export function buildPath(prefix: string, name: string): string {
  const clean = sanitizeName(name).replace(/\s+/g, "-");
  const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `${prefix}/${rand}-${clean}`.slice(0, 500);
}

export async function signedUpload(admin: Admin, bucket: string, path: string) {
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error("Could not prepare upload. Please try again.");
  return data as { signedUrl: string; token: string; path: string };
}

export async function signedDownload(admin: Admin, bucket: string, path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function objectExists(admin: Admin, bucket: string, path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  if (slash < 0) return false;
  const { data, error } = await admin.storage.from(bucket).list(path.slice(0, slash), { limit: 10, search: path.slice(slash + 1, slash + 41) });
  if (error || !data) return false;
  return data.some((o) => o.name === path.slice(slash + 1));
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
