"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useYjsBoard } from "./use-yjs-board";

interface Member {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
}

interface BoardDetail {
  id: string;
  name: string;
  members: Member[];
}

export default function BoardPage({ params }: { params: { id: string } }) {
  const boardId = params.id;
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState<Record<string, string>>({});
  const [dragCardId, setDragCardId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setMe(data.user));

    fetch(`/api/boards/${boardId}`).then(async (r) => {
      if (!r.ok) {
        setNotFound(true);
        return;
      }
      const data = await r.json();
      setBoard(data.board);
      setMyRole(data.role);
    });
  }, [boardId]);

  const yjs = useYjsBoard(boardId, me?.name ?? "Anonim");

  if (notFound) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-slate-600">Board tidak ditemukan atau kamu bukan anggotanya.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-brand-600 hover:underline">
          Kembali ke dashboard
        </Link>
      </main>
    );
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setInviteError(null);
    const response = await fetch(`/api/boards/${boardId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });
    const data = await response.json();
    if (!response.ok) {
      setInviteError(data.error ?? "Gagal menambah anggota");
      return;
    }
    setInviteEmail("");
    setBoard((prev) => (prev ? { ...prev, members: [...prev.members, data.member] } : prev));
  }

  function handleDrop(columnId: string, targetIndex: number) {
    if (!dragCardId) return;
    yjs.moveCard(dragCardId, columnId, targetIndex);
    setDragCardId(null);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-slate-500 hover:text-brand-600">
              ← Dashboard
            </Link>
            <h1 className="text-lg font-bold text-slate-900">{board?.name ?? "Memuat..."}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`h-2 w-2 rounded-full ${yjs.connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-xs text-slate-500">{yjs.connected ? "Realtime tersambung" : "Menyambungkan..."}</span>
            <div className="flex -space-x-2">
              {yjs.onlineUsers.map((u) => (
                <span
                  key={u.clientId}
                  title={u.name}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white"
                  style={{ backgroundColor: u.color }}
                >
                  {u.name.charAt(0).toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {myRole === "OWNER" && (
          <form onSubmit={handleInvite} className="mb-6 flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700">Undang anggota (email)</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">
              Undang
            </button>
            {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          </form>
        )}

        <div className="flex gap-4 overflow-x-auto pb-4">
          {yjs.columns.map((column) => {
            const columnCards = yjs.cards
              .filter((c) => c.columnId === column.id)
              .sort((a, b) => a.order - b.order);

            return (
              <div
                key={column.id}
                className="w-72 flex-shrink-0 rounded-xl border border-slate-200 bg-white p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(column.id, columnCards.length)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-800">{column.title}</h2>
                  <span className="text-xs text-slate-400">{columnCards.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {columnCards.map((card, index) => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => setDragCardId(card.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.stopPropagation();
                        handleDrop(column.id, index);
                      }}
                      className="group cursor-grab rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 hover:border-brand-400"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span>{card.title}</span>
                        <button
                          onClick={() => yjs.deleteCard(card.id)}
                          className="hidden text-xs text-slate-400 hover:text-red-500 group-hover:block"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const title = newCardTitle[column.id]?.trim();
                    if (!title) return;
                    yjs.addCard(column.id, title);
                    setNewCardTitle((prev) => ({ ...prev, [column.id]: "" }));
                  }}
                  className="mt-3"
                >
                  <input
                    placeholder="+ Tambah kartu"
                    value={newCardTitle[column.id] ?? ""}
                    onChange={(e) => setNewCardTitle((prev) => ({ ...prev, [column.id]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </form>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
