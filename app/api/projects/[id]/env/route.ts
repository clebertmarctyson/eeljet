import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { syncEnvToVPS } from "@/lib/services/subdomain-deployer";
import { toUserError } from "@/lib/services/error-messages";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/projects/[id]/env
 * Returns all environment variables for a project (keys only, values are masked)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    // Verify project belongs to user
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
      include: { envVars: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Return env vars with decrypted values (for editing)
    const envVars = project.envVars.map((env) => ({
      id: env.id,
      key: env.key,
      value: decrypt(env.encryptedValue),
    }));

    return NextResponse.json(envVars);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: toUserError(message) }, { status: 500 });
  }
}

/**
 * POST /api/projects/[id]/env
 * Add a new environment variable
 * Body: { key: string, value: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    // Verify project belongs to user
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const { key, value } = body;

    if (!key || typeof key !== "string") {
      return NextResponse.json(
        { error: "key is required and must be a string" },
        { status: 400 }
      );
    }

    if (value === undefined || typeof value !== "string") {
      return NextResponse.json(
        { error: "value is required and must be a string" },
        { status: 400 }
      );
    }

    // Check if key already exists
    const existing = await prisma.environmentVar.findUnique({
      where: { projectId_key: { projectId: id, key } },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Environment variable "${key}" already exists` },
        { status: 409 }
      );
    }

    const envVar = await prisma.environmentVar.create({
      data: {
        projectId: id,
        key,
        encryptedValue: encrypt(value),
      },
    });

    return NextResponse.json({
      id: envVar.id,
      key: envVar.key,
      value, // Return unencrypted value for UI
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: toUserError(message) }, { status: 400 });
  }
}

/**
 * PUT /api/projects/[id]/env
 * Update all environment variables (bulk update)
 * Body: { envVars: { key: string, value: string }[] }
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    // Verify project belongs to user
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const { envVars } = body;

    if (!Array.isArray(envVars)) {
      return NextResponse.json(
        { error: "envVars must be an array" },
        { status: 400 }
      );
    }

    // Delete existing env vars and create new ones
    await prisma.$transaction([
      prisma.environmentVar.deleteMany({ where: { projectId: id } }),
      prisma.environmentVar.createMany({
        data: envVars
          .filter((env: { key: string; value: string }) => env.key.trim())
          .map((env: { key: string; value: string }) => ({
            projectId: id,
            key: env.key.trim(),
            encryptedValue: encrypt(env.value),
          })),
      }),
    ]);

    // Sync .env file to VPS if project has been deployed
    let vpsSynced = false;
    let vpsSyncError: string | undefined;

    if (["ACTIVE", "STOPPED", "FAILED"].includes(project.status)) {
      const syncResult = await syncEnvToVPS(id);
      vpsSynced = syncResult.success;
      vpsSyncError = syncResult.error;
    }

    return NextResponse.json({ success: true, vpsSynced, vpsSyncError });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: toUserError(message) }, { status: 400 });
  }
}

/**
 * DELETE /api/projects/[id]/env
 * Delete an environment variable
 * Body: { key: string }
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    // Verify project belongs to user
    const project = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const { key } = body;

    if (!key || typeof key !== "string") {
      return NextResponse.json(
        { error: "key is required and must be a string" },
        { status: 400 }
      );
    }

    await prisma.environmentVar.delete({
      where: { projectId_key: { projectId: id, key } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: toUserError(message) }, { status: 400 });
  }
}
