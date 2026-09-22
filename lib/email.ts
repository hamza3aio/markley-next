import { Resend } from "resend";

const APP = (process.env.APP_URL ?? "").replace(/\/$/, "");

export function appLink(path: string): string {
  return APP ? APP + path : path;
}

export async function notifyUsers(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  args: { user_ids: (string | null | undefined)[]; type: string; title: string; body?: string; link?: string }
): Promise<number> {
  const ids = [...new Set(args.user_ids.filter(Boolean) as string[])].slice(0, 500);
  if (!ids.length) return 0;
  const rows = ids.map((user_id) => ({
    user_id,
    type: args.type,
    title: args.title.slice(0, 200),
    body: (args.body ?? "").slice(0, 1000),
    link: (args.link ?? "").slice(0, 500),
  }));
  const { error } = await admin.from("notifications").insert(rows);
  return error ? 0 : rows.length;
}

function shell(title: string, bodyHtml: string, link: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto"><h2>${title}</h2><div>${bodyHtml}</div>${link ? `<p><a href="${link}">${link}</a></p>` : ""}<p style="color:#64748b;font-size:12px">Markley Educational Platform</p></div>`;
}

export async function sendEmail(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  userIds: string[],
  subject: string,
  title: string,
  bodyHtml: string,
  link = ""
): Promise<number> {
  const key = process.env.RESEND_API_KEY ?? "";
  const from = process.env.RESEND_FROM ?? "";
  if (!key || !from) return 0;
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 100);
  if (!ids.length) return 0;
  const { data: profs } = await admin
    .from("profiles")
    .select("id,email,email_notifications,status")
    .in("id", ids);
  const to = (profs ?? [])
    .filter((p) => p.status === "active" && p.email_notifications !== false)
    .map((p) => p.email as string);
  if (!to.length) return 0;
  try {
    await new Resend(key).emails.send({
      from,
      to,
      subject: subject.slice(0, 120),
      html: shell(title, bodyHtml, link || APP),
    });
    return to.length;
  } catch {
    return 0;
  }
}
