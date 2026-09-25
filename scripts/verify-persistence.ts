import "dotenv/config";
import WS from "ws";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { prisma } from "../src/lib/prisma";
import { signSession } from "../src/lib/session-token";

const SERVER_URL = process.env.VERIFY_SERVER_URL ?? "ws://localhost:3000/yjs";
const BOARD_ID = "demo-board";

async function main() {
  const alice = await prisma.user.findUniqueOrThrow({ where: { email: "alice@kanban.dev" } });
  const token = signSession({ sub: alice.id, name: alice.name, email: alice.email });

  const doc = new Y.Doc();
  const provider = new WebsocketProvider(SERVER_URL, BOARD_ID, doc, {
    WebSocketPolyfill: WS as unknown as typeof WebSocket,
    params: { token },
  });

  await new Promise<void>((resolve) => {
    if (provider.synced) resolve();
    else provider.once("sync", () => resolve());
  });

  const cards = doc.getMap<Y.Map<unknown>>("cards");
  const card1 = cards.get("card-1");
  console.log(`[verify-persistence] card-1 columnId setelah server restart: ${card1?.get("columnId")}`);

  if (card1?.get("columnId") !== "done") {
    throw new Error("GAGAL: state tidak persisten setelah server restart (seharusnya 'done')");
  }
  console.log("[verify-persistence] BERHASIL: snapshot board berhasil dimuat ulang dari database setelah server restart.");

  provider.destroy();
  doc.destroy();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error("[verify-persistence] ERROR:", error);
  process.exit(1);
});
