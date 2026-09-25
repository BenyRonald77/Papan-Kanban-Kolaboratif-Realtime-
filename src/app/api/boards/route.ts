import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { buildDefaultBoardState } from "@/lib/default-board-state";

const createBoardSchema = z.object({
  name: z.string().min(2),
});

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const memberships = await prisma.boardMember.findMany({
    where: { userId: user.id },
    include: { board: true },
    orderBy: { board: { updatedAt: "desc" } },
  });

  return NextResponse.json({
    boards: memberships.map((m) => ({ ...m.board, role: m.role })),
  });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createBoardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const board = await prisma.board.create({
    data: {
      name: parsed.data.name,
      ownerId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
      snapshot: { create: { state: buildDefaultBoardState() } },
    },
  });

  return NextResponse.json({ board }, { status: 201 });
}
