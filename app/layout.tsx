import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Markley Educational Platform — IGCSE learning for Egypt",
  description:
    "Classes, assignments, grading, past papers with mark schemes, quizzes, live sessions and analytics for IGCSE students in Egypt.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
