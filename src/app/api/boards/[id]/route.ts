import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: params.id, userId: user.id } },
  });
  if (!membership) {
    return NextResponse.json({ error: "Board tidak ditemukan" }, { status: 404 });
  }

  const board = await prisma.board.findUnique({
    where: { id: params.id },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  return NextResponse.json({ board, role: membership.role });
}
