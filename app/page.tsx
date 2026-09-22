import Link from "next/link";

const FEATURES = [
  ["🏫", "Classes & invitations", "Teachers create classes and invite students by email. Single-use links with expiry. No random joins."],
  ["📝", "Assignments", "Guided written work and file uploads, due dates, late rules, attachments — plus a mobile camera-to-PDF scanner."],
  ["📊", "Grading & analytics", "Manual grades with feedback, attendance tracking, per-student analytics and one-click Excel reports."],
  ["📚", "Exams library", "Searchable past papers with mark schemes by subject, board, year, session and paper."],
  ["🏆", "Gamification", "Teacher-defined point systems, opt-in leaderboards with privacy controls, and unlockable achievements."],
  ["🤖", "AI study tools", "Quiz and assignment generators plus grading suggestions — always teacher-approved, never automatic."],
  ["📅", "Calendar & sessions", "Deadlines, events and live Zoom/Teams/Meet sessions in one calendar with reminders."],
  ["🔔", "Notifications", "In-app inbox plus email for grades, assignments, invitations and sessions."],
];

const ROLES = [
  ["👩‍🏫", "Teachers", "Run classes end to end: content, assignments, grading, attendance, analytics, points and AI drafts."],
  ["🎓", "Students", "Join by invitation, submit from any phone, scan pages to PDF, take quizzes, track points and achievements."],
  ["👨‍👩‍👧", "Parents", "Follow linked students: grades, attendance, assignments and upcoming sessions. Free, forever."],
];

export default function Home() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-mark">M</span> Markley</div>
          <div className="spacer" />
          <Link className="btn ghost" href="/login">Sign in</Link>
          <Link className="btn" href="/signup">Get started</Link>
        </div>
      </header>
      <main className="container">
        <section className="hero">
          <h1>IGCSE learning, organized like a classroom — powered like a platform.</h1>
          <p className="sub">Markley gives Egyptian IGCSE students, teachers, assistants and parents one place for classes, assignments, grading, past papers with mark schemes, quizzes, live sessions and progress analytics.</p>
          <div className="cta-row">
            <Link className="btn" href="/signup">Create free account</Link>
            <Link className="btn secondary" href="/login">Sign in</Link>
          </div>
          <div className="chips">
            {["5 role dashboards", "Invitation-only classes", "Past papers + mark schemes", "Mobile PDF scanner", "AI study tools"].map((c) => (
              <span key={c} className="badge">{c}</span>
            ))}
          </div>
        </section>
        <section className="section">
          <h2>Everything a class needs</h2>
          <p className="lead">Not a static website — a working platform with secure logins, permissions, file storage and activity tracking.</p>
          <div className="grid cols-4">
            {FEATURES.map(([icon, title, body]) => (
              <div key={title} className="card feat">
                <div className="icon">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="section">
          <h2>Built for every role</h2>
          <p className="lead">Each role gets its own dashboard, enforced server-side — never just hidden buttons.</p>
          <div className="grid cols-3">
            {ROLES.map(([icon, title, body]) => (
              <div key={title} className="card feat">
                <div className="icon">{icon}</div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="section">
          <h2>Get started in minutes</h2>
          <div className="cta-row" style={{ marginTop: 8 }}>
            <Link className="btn" href="/signup">Start free</Link>
          </div>
        </section>
      </main>
      <footer className="site">Markley Educational Platform · Built for IGCSE students in Egypt · <Link href="/login">Sign in</Link></footer>
    </>
  );
}
