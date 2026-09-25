"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

export interface CardData {
  id: string;
  title: string;
  columnId: string;
  order: number;
}

export interface ColumnData {
  id: string;
  title: string;
}

export interface PresenceUser {
  clientId: number;
  name: string;
  color: string;
}

const PRESENCE_COLORS = ["#f97316", "#22c55e", "#3b82f6", "#ec4899", "#a855f7", "#14b8a6"];

function pickColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

export function useYjsBoard(boardId: string, userName: string) {
  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  const [connected, setConnected] = useState(false);
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [cards, setCards] = useState<CardData[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const doc = new Y.Doc();
    docRef.current = doc;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const provider = new WebsocketProvider(`${protocol}//${window.location.host}/yjs`, boardId, doc, {
      connect: true,
    });
    providerRef.current = provider;

    provider.awareness.setLocalStateField("user", {
      name: userName,
      color: pickColor(userName + Math.random()),
    });

    const columnOrder = doc.getArray<string>("columnOrder");
    const columnsMap = doc.getMap<Y.Map<unknown>>("columns");
    const cardsMap = doc.getMap<Y.Map<unknown>>("cards");

    function syncColumns() {
      const order = columnOrder.toArray();
      setColumns(
        order.map((id) => ({
          id,
          title: String(columnsMap.get(id)?.get("title") ?? id),
        }))
      );
    }

    function syncCards() {
      const list: CardData[] = [];
      cardsMap.forEach((cardMap, id) => {
        list.push({
          id,
          title: String(cardMap.get("title") ?? ""),
          columnId: String(cardMap.get("columnId") ?? ""),
          order: Number(cardMap.get("order") ?? 0),
        });
      });
      list.sort((a, b) => a.order - b.order);
      setCards(list);
    }

    function syncPresence() {
      const states = provider.awareness.getStates();
      const users: PresenceUser[] = [];
      states.forEach((state, clientId) => {
        const user = (state as { user?: { name: string; color: string } }).user;
        if (user) {
          users.push({ clientId, name: user.name, color: user.color });
        }
      });
      setOnlineUsers(users);
    }

    columnOrder.observe(syncColumns);
    columnsMap.observeDeep(syncColumns);
    cardsMap.observeDeep(syncCards);
    provider.awareness.on("change", syncPresence);
    provider.on("status", ({ status }: { status: string }) => setConnected(status === "connected"));

    syncColumns();
    syncCards();
    syncPresence();

    return () => {
      provider.awareness.off("change", syncPresence);
      provider.destroy();
      doc.destroy();
    };
  }, [boardId, userName]);

  const actions = useMemo(
    () => ({
      moveCard(cardId: string, targetColumnId: string, newOrder: number) {
        const doc = docRef.current;
        if (!doc) return;
        const cardsMap = doc.getMap<Y.Map<unknown>>("cards");
        const card = cardsMap.get(cardId);
        if (!card) return;
        doc.transact(() => {
          card.set("columnId", targetColumnId);
          card.set("order", newOrder);
          card.set("updatedAt", Date.now());
        });
      },
      addCard(columnId: string, title: string) {
        const doc = docRef.current;
        if (!doc) return;
        const cardsMap = doc.getMap<Y.Map<unknown>>("cards");
        const siblingCount = Array.from(cardsMap.values()).filter(
          (c) => c.get("columnId") === columnId
        ).length;
        const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const cardMap = new Y.Map();
        cardMap.set("title", title);
        cardMap.set("columnId", columnId);
        cardMap.set("order", siblingCount);
        cardMap.set("updatedAt", Date.now());
        doc.transact(() => {
          cardsMap.set(id, cardMap);
        });
      },
      deleteCard(cardId: string) {
        const doc = docRef.current;
        if (!doc) return;
        const cardsMap = doc.getMap<Y.Map<unknown>>("cards");
        doc.transact(() => {
          cardsMap.delete(cardId);
        });
      },
    }),
    []
  );

  return { connected, columns, cards, onlineUsers, ...actions };
}
