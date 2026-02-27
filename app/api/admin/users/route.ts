import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/admin/users
 * Returns all users with project counts. Admin only.
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      githubUsername: true,
      image: true,
      role: true,
      plan: true,
      createdAt: true,
      _count: {
        select: { projects: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      githubUsername: u.githubUsername,
      image: u.image,
      role: u.role,
      plan: u.plan,
      projectCount: u._count.projects,
      createdAt: u.createdAt,
    })),
  );
}

/**
 * PATCH /api/admin/users
 * Update a user's role or plan. Admin only.
 * Body: { userId, role?, plan? }
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { userId, role, plan } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 },
    );
  }

  // Prevent admin from demoting themselves
  if (userId === session.user.id && role && role !== "ADMIN") {
    return NextResponse.json(
      { error: "Cannot change your own role" },
      { status: 400 },
    );
  }

  const data: Record<string, string> = {};
  if (role && (role === "USER" || role === "ADMIN")) {
    data.role = role;
  }
  if (plan && (plan === "FREE" || plan === "PRO")) {
    data.plan = plan;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update. Provide role or plan." },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      plan: true,
    },
    data,
  });

  return NextResponse.json(updated);
}
