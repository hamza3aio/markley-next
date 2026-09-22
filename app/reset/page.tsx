import Link from "next/link";
import { ResetForm } from "../signup/forms";

export default function ResetPage() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/"><span className="brand-mark">M</span> Markley</Link>
        </div>
      </header>
      <main className="container" style={{ maxWidth: 480, padding: "32px 16px" }}>
        <ResetForm />
      </main>
    </>
  );
}
