import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Papan Kanban Kolaboratif Realtime",
  description: "Papan Kanban multi-user realtime dengan CRDT (Yjs) untuk resolusi konflik otomatis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
