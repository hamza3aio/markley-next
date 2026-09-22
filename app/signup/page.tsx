import Link from "next/link";
import { SignUpForm } from "./forms";

export default function SignUpPage() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" href="/"><span className="brand-mark">M</span> Markley</Link>
        </div>
      </header>
      <main className="container" style={{ maxWidth: 480, padding: "32px 16px" }}>
        <SignUpForm />
      </main>
    </>
  );
}
