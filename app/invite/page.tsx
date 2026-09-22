import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { acceptAction } from "@/app/dashboard/invitations/actions";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <main className="container" style={{ maxWidth: 520, padding: "48px 16px" }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Invalid invitation</h1>
          <p style={{ color: "var(--muted)" }}>This link is missing its token. Ask your teacher for a new one.</p>
        </div>
      </main>
    );
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite?token=${token}`)}`);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/dashboard"><span className="brand-mark">M</span> Markley</Link>
        </div>
      </header>
      <main className="container" style={{ maxWidth: 520, padding: "32px 16px" }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Class invitation</h1>
          <p style={{ color: "var(--muted)" }}>Invitations are single-use and expire. Click below to join.</p>
          <form action={acceptAction.bind(null, token)}>
            <button className="btn" type="submit">Accept and join class</button>
          </form>
          <p style={{ fontSize: 14 }}><Link href="/dashboard/invitations">View all invitations</Link></p>
        </div>
      </main>
    </>
  );
}
