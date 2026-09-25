import "dotenv/config";
import WS from "ws";
import { prisma } from "../src/lib/prisma";
import { signSession } from "../src/lib/session-token";

const SERVER_HOST = process.env.VERIFY_SERVER_HOST ?? "ws://localhost:3000";
const BOARD_ID = "demo-board";

async function tryConnect(token: string | null, label: string) {
  return new Promise<void>((resolve) => {
    const url = token ? `${SERVER_HOST}/yjs/${BOARD_ID}?token=${token}` : `${SERVER_HOST}/yjs/${BOARD_ID}`;
    const ws = new WS(url);
    const timer = setTimeout(() => {
      console.log(`[verify-ws-auth] ${label}: TIMEOUT (tidak ada respons)`);
      ws.terminate();
      resolve();
    }, 3000);

    ws.on("open", () => {
      clearTimeout(timer);
      console.log(`[verify-ws-auth] ${label}: KONEKSI DITERIMA (seharusnya hanya untuk anggota board)`);
      ws.close();
      resolve();
    });
    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      console.log(`[verify-ws-auth] ${label}: ditolak dengan status HTTP ${res.statusCode}`);
      resolve();
    });
    ws.on("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const charlie = await prisma.user.findUniqueOrThrow({ where: { email: "charlie@kanban.dev" } });
  const charlieToken = signSession({ sub: charlie.id, name: charlie.name, email: charlie.email });

  await tryConnect(null, "Tanpa token");
  await tryConnect("token-palsu-tidak-valid", "Token tidak valid");
  await tryConnect(charlieToken, "User valid TAPI bukan anggota board (Charlie)");

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
