import "dotenv/config";
import WS from "ws";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { prisma } from "../src/lib/prisma";
import { signSession } from "../src/lib/session-token";

const SERVER_URL = process.env.VERIFY_SERVER_URL ?? "ws://localhost:3000/yjs";
const BOARD_ID = "demo-board";

function waitForSync(provider: WebsocketProvider): Promise<void> {
  return new Promise((resolve) => {
    if (provider.synced) {
      resolve();
      return;
    }
    provider.once("sync", () => resolve());
  });
}

function connectClient(userId: string, name: string, email: string) {
  const token = signSession({ sub: userId, name, email });
  const doc = new Y.Doc();
  const provider = new WebsocketProvider(SERVER_URL, BOARD_ID, doc, {
    WebSocketPolyfill: WS as unknown as typeof WebSocket,
    params: { token },
  });
  provider.on("status", ({ status }: { status: string }) => console.log(`[verify:${name}] status=${status}`));
  provider.on("connection-error", (event: unknown) => console.log(`[verify:${name}] connection-error`, event));
  console.log(`[verify:${name}] connecting to ${provider.url}`);
  return { doc, provider };
}

async function main() {
  const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@kanban.dev" } });
  const bob = await prisma.user.findUniqueOrThrow({ where: { email: "bob@kanban.dev" } });

  console.log("[verify] Menyambungkan dua klien Yjs terpisah (Alice & Bob) ke board yang sama...");
  const clientA = connectClient(alice.id, "Alice", alice.email);
  const clientB = connectClient(bob.id, "Bob", bob.email);

  await Promise.all([waitForSync(clientA.provider), waitForSync(clientB.provider)]);
  console.log("[verify] Kedua klien sudah sinkron dengan state awal dari server.");

  const cardsA = clientA.doc.getMap<Y.Map<unknown>>("cards");
  const cardsB = clientB.doc.getMap<Y.Map<unknown>>("cards");

  const cardId = "card-1";
  if (!cardsA.has(cardId) || !cardsB.has(cardId)) {
    throw new Error(`Kartu ${cardId} tidak ditemukan di salah satu klien - pastikan sudah menjalankan seed.`);
  }

  console.log(`[verify] SIMULTAN: Alice memindahkan ${cardId} -> "doing", Bob memindahkan ${cardId} -> "done"`);

  // Kedua klien mengubah kartu yang SAMA ke kolom BERBEDA pada saat yang (nyaris) bersamaan,
  // sebelum salah satu update sempat sampai ke klien lain. Ini mensimulasikan race condition nyata.
  clientA.doc.transact(() => {
    const card = cardsA.get(cardId)!;
    card.set("columnId", "doing");
    card.set("order", 0);
    card.set("updatedAt", Date.now());
  });

  clientB.doc.transact(() => {
    const card = cardsB.get(cardId)!;
    card.set("columnId", "done");
    card.set("order", 0);
    card.set("updatedAt", Date.now() + 1); // sedikit lebih baru agar hasil deterministik & bisa diverifikasi
  });

  // Beri waktu untuk pertukaran update lewat WebSocket server
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const finalColumnA = cardsA.get(cardId)!.get("columnId");
  const finalOrderA = cardsA.get(cardId)!.get("order");
  const finalColumnB = cardsB.get(cardId)!.get("columnId");
  const finalOrderB = cardsB.get(cardId)!.get("order");

  console.log(`[verify] State akhir di klien Alice: columnId=${finalColumnA}, order=${finalOrderA}`);
  console.log(`[verify] State akhir di klien Bob:   columnId=${finalColumnB}, order=${finalOrderB}`);

  if (finalColumnA !== finalColumnB || finalOrderA !== finalOrderB) {
    throw new Error(
      "GAGAL: kedua klien TIDAK konvergen ke state yang sama - resolusi konflik CRDT tidak bekerja"
    );
  }

  console.log(
    `[verify] BERHASIL: kedua klien konvergen ke state identik (columnId=${finalColumnA}). ` +
      "Konflik dua user memindahkan kartu yang sama secara bersamaan terselesaikan otomatis tanpa kehilangan data."
  );

  clientA.provider.destroy();
  clientB.provider.destroy();
  clientA.doc.destroy();
  clientB.doc.destroy();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("[verify] ERROR:", error);
  process.exit(1);
});
