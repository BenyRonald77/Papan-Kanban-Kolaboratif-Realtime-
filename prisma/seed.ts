import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as Y from "yjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const alice = await prisma.user.upsert({
    where: { email: "alice@kanban.dev" },
    update: {},
    create: { name: "Alice", email: "alice@kanban.dev", passwordHash },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@kanban.dev" },
    update: {},
    create: { name: "Bob", email: "bob@kanban.dev", passwordHash },
  });

  const board = await prisma.board.upsert({
    where: { id: "demo-board" },
    update: {},
    create: { id: "demo-board", name: "Board Demo", ownerId: alice.id },
  });

  await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId: board.id, userId: alice.id } },
    update: {},
    create: { boardId: board.id, userId: alice.id, role: "OWNER" },
  });

  await prisma.boardMember.upsert({
    where: { boardId_userId: { boardId: board.id, userId: bob.id } },
    update: {},
    create: { boardId: board.id, userId: bob.id, role: "MEMBER" },
  });

  const existingSnapshot = await prisma.boardSnapshot.findUnique({ where: { boardId: board.id } });
  if (!existingSnapshot) {
    const doc = new Y.Doc();
    const columnOrder = doc.getArray<string>("columnOrder");
    const columns = doc.getMap<Y.Map<unknown>>("columns");
    const cards = doc.getMap<Y.Map<unknown>>("cards");

    const columnDefs = [
      { id: "todo", title: "To Do" },
      { id: "doing", title: "In Progress" },
      { id: "done", title: "Done" },
    ];

    doc.transact(() => {
      columnDefs.forEach((c) => {
        columnOrder.push([c.id]);
        const colMap = new Y.Map();
        colMap.set("title", c.title);
        columns.set(c.id, colMap);
      });

      const cardDefs = [
        { id: "card-1", title: "Desain wireframe", columnId: "todo", order: 0 },
        { id: "card-2", title: "Setup database", columnId: "todo", order: 1 },
        { id: "card-3", title: "Implementasi realtime sync", columnId: "doing", order: 0 },
      ];
      cardDefs.forEach((c) => {
        const cardMap = new Y.Map();
        cardMap.set("title", c.title);
        cardMap.set("columnId", c.columnId);
        cardMap.set("order", c.order);
        cardMap.set("updatedAt", Date.now());
        cards.set(c.id, cardMap);
      });
    });

    const state = Buffer.from(Y.encodeStateAsUpdate(doc));
    await prisma.boardSnapshot.create({ data: { boardId: board.id, state } });
  }

  console.log("Seed selesai.");
  console.log("Login demo: alice@kanban.dev / password123 (owner)");
  console.log("Login demo: bob@kanban.dev / password123 (member)");
  console.log(`Board demo id: ${board.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
