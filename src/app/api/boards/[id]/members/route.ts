import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

const inviteSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: params.id, userId: user.id } },
  });
  if (!membership || membership.role !== "OWNER") {
    return NextResponse.json({ error: "Hanya owner yang bisa menambah anggota" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!targetUser) {
    return NextResponse.json({ error: "User dengan email tersebut tidak ditemukan" }, { status: 404 });
  }

  const existing = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId: params.id, userId: targetUser.id } },
  });
  if (existing) {
    return NextResponse.json({ error: "User sudah menjadi anggota board ini" }, { status: 409 });
  }

  const newMember = await prisma.boardMember.create({
    data: { boardId: params.id, userId: targetUser.id, role: "MEMBER" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ member: newMember }, { status: 201 });
}
