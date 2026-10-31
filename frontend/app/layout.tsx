import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoLens — visual codebase onboarding",
  description:
    "Paste a GitHub URL. Graphify builds the knowledge graph, Gemma 4 turns it into a guided tour, Q&A and diagram drift checks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
