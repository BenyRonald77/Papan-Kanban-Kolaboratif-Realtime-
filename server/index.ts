import "dotenv/config";
import { createServer } from "http";
import next from "next";
import { WebSocketServer } from "ws";
import { setupWSConnection, setContentInitializor, getYDoc } from "y-websocket/bin/utils";
import { verifySession, SESSION_COOKIE_NAME } from "../src/lib/session-token";
import { prisma } from "../src/lib/prisma";
import { loadBoardState } from "../src/lib/yjs-persistence";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev });
const handle = app.getRequestHandler();

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const match = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(name.length + 1));
}

setContentInitializor(loadBoardState);

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (request, socket, head) => {
    const url = new URL(request.url ?? "", "http://localhost");
    if (!url.pathname.startsWith("/yjs/")) {
      socket.destroy();
      return;
    }

    const boardId = url.pathname.replace("/yjs/", "");
    const token = parseCookie(request.headers.cookie, SESSION_COOKIE_NAME) ?? url.searchParams.get("token");
    const session = token ? verifySession(token) : null;

    if (!session || !boardId) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const membership = await prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: session.sub } },
    });

    if (!membership) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    // Tunggu doc selesai dimuat dari database (lewat contentInitializor) SEBELUM
    // mengirim sync step pertama ke klien, agar klien tidak sempat melihat
    // state kosong yang kemudian "tiba-tiba" terisi lewat update susulan.
    const docName = `board:${boardId}`;
    const doc = getYDoc(docName);
    await doc.whenInitialized;

    wss.handleUpgrade(request, socket, head, (ws) => {
      setupWSConnection(ws, request, { docName });
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Server siap di http://localhost:${port} (Next.js + WebSocket Yjs di /yjs/:boardId)`);
  });
});
