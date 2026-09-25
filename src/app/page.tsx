import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-bold text-brand-700">
        Papan Kanban Kolaboratif Realtime
      </h1>
      <p className="text-slate-600">
        Edit papan Kanban bersama tim secara realtime dengan CRDT (Yjs) —
        perubahan langsung terlihat, konflik terselesaikan otomatis.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700"
      >
        Masuk
      </Link>
    </main>
  );
}
