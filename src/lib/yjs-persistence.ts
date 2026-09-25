import * as Y from "yjs";
import { prisma } from "./prisma";

const DEBOUNCE_MS = Number(process.env.SNAPSHOT_DEBOUNCE_MS ?? 2000);
const pendingTimers = new Map<string, NodeJS.Timeout>();

function boardIdFromDocName(docName: string) {
  return docName.replace(/^board:/, "");
}

async function saveSnapshot(docName: string, doc: Y.Doc) {
  const boardId = boardIdFromDocName(docName);
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  await prisma.boardSnapshot.upsert({
    where: { boardId },
    create: { boardId, state },
    update: { state },
  });
}

function scheduleSave(docName: string, doc: Y.Doc) {
  const existingTimer = pendingTimers.get(docName);
  if (existingTimer) clearTimeout(existingTimer);
  pendingTimers.set(
    docName,
    setTimeout(() => {
      pendingTimers.delete(docName);
      const boardId = boardIdFromDocName(docName);
      saveSnapshot(docName, doc).catch((error) => {
        console.error(`[yjs-persistence] gagal menyimpan snapshot board ${boardId}:`, error);
      });
    }, DEBOUNCE_MS)
  );
}

/**
 * Dipakai sebagai `contentInitializor` y-websocket (bukan `persistence.bindState`),
 * karena `whenInitialized` yang dihasilkannya DI-AWAIT secara eksplisit di
 * `server/index.ts` sebelum sync step pertama dikirim ke klien. Ini mencegah
 * race condition: tanpa menunggu, klien bisa menerima state kosong terlebih
 * dahulu (karena `persistence.bindState` bawaan y-websocket tidak pernah
 * di-await oleh `getYDoc`), lalu baru menyusul update lewat broadcast terpisah.
 */
export async function loadBoardState(doc: Y.Doc) {
  const docName = (doc as unknown as { name: string }).name;
  const boardId = boardIdFromDocName(docName);
  const existing = await prisma.boardSnapshot.findUnique({ where: { boardId } });
  if (existing) {
    Y.applyUpdate(doc, new Uint8Array(existing.state));
  }
  doc.on("update", () => scheduleSave(docName, doc));
}

export async function flushBoardState(docName: string, doc: Y.Doc) {
  const existingTimer = pendingTimers.get(docName);
  if (existingTimer) clearTimeout(existingTimer);
  pendingTimers.delete(docName);
  await saveSnapshot(docName, doc);
}
