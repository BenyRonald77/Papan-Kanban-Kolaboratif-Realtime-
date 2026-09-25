"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Board {
  id: string;
  name: string;
  role: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    const response = await fetch("/api/boards");
    if (response.ok) {
      const data = await response.json();
      setBoards(data.boards);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (response.ok) {
        setName("");
        load();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Buat Board Baru</h2>
        <form onSubmit={handleCreate} className="mt-4 flex gap-3">
          <input
            required
            placeholder="Nama board"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {creating ? "Membuat..." : "Buat Board"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Board Saya</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {boards.map((board) => (
            <Link
              key={board.id}
              href={`/boards/${board.id}`}
              className="rounded-lg border border-slate-200 p-4 hover:border-brand-400 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">{board.name}</span>
                <span className="text-xs font-semibold uppercase text-slate-400">{board.role}</span>
              </div>
            </Link>
          ))}
          {boards.length === 0 && <p className="text-sm text-slate-400">Belum ada board.</p>}
        </div>
      </section>
    </div>
  );
}
