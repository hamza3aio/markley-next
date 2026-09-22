import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { signOutAction } from "@/app/login/actions";
import { NotificationsBell } from "./notifications-bell";

const TABS = [
  { id: "overview", label: "Dashboard", href: "/dashboard", roles: ["admin", "teacher", "assistant", "student", "parent"] },
  { id: "classes", label: "Classes", href: "/dashboard/classes", roles: ["admin", "teacher", "assistant", "student", "parent"] },
  { id: "assignments", label: "Assignments", href: "/dashboard/assignments", roles: ["admin", "teacher", "assistant", "student", "parent"] },
  { id: "quizzes", label: "Quizzes", href: "/dashboard/quizzes", roles: ["admin", "teacher", "assistant", "student", "parent"] },
  { id: "calendar", label: "Calendar", href: "/dashboard/calendar", roles: ["admin", "teacher", "assistant", "student", "parent"] },
  { id: "exams", label: "Exams", href: "/dashboard/exams", roles: ["admin", "teacher", "assistant", "student", "parent"] },
  { id: "invitations", label: "Invitations", href: "/dashboard/invitations", roles: ["admin", "teacher", "assistant", "student", "parent"] },
  { id: "students", label: "Students", href: "/dashboard/students", roles: ["admin", "teacher", "parent"] },
  { id: "plans", label: "Plans", href: "/dashboard/plans", roles: ["admin"] },
  { id: "plan", label: "My plan", href: "/dashboard/plan", roles: ["teacher", "assistant"] },
  { id: "activity", label: "Activity", href: "/dashboard/activity", roles: ["admin", "teacher", "assistant", "student", "parent"] },
  { id: "settings", label: "Settings", href: "/dashboard/settings", roles: ["admin", "teacher", "assistant", "student", "parent"] },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const tabs = TABS.filter((t) => t.roles.includes(viewer.profile.role));

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/dashboard"><span className="brand-mark">M</span> Markley</Link>
          <div className="spacer" />
          <NotificationsBell />
          <span className="badge">{viewer.profile.full_name || viewer.profile.email} · {viewer.profile.role}</span>
          <form action={signOutAction}>
            <button className="btn ghost" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <div className="shell">
        <aside className="sidebar">
          <nav>
            {tabs.map((t) => (
              <Link key={t.id} href={t.href}>{t.label}</Link>
            ))}
          </nav>
        </aside>
        <main className="main">{children}</main>
      </div>
    </>
  );
}
