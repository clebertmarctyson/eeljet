import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getProject,
  deleteProject,
  deployProject,
  restartProject,
  stopProject,
} from "@/lib/services/subdomain-deployer";
import { toUserError } from "@/lib/services/error-messages";
import prisma from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/projects/[id]
 * Returns a single project with all its details
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const project = await getProject(session.user.id, id);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: toUserError(message) }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/[id]
 * Updates a project (name, branch, etc.)
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    // Verify project belongs to user
    const existing = await prisma.project.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, branch, nodeVersion, rootDirectory } = body;

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(branch && { branch }),
        ...(nodeVersion && { nodeVersion }),
        ...(rootDirectory !== undefined && { rootDirectory }),
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: toUserError(message) }, { status: 400 });
  }
}

/**
 * DELETE /api/projects/[id]
 * Removes a project and all its resources
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Verify project belongs to user
  const existing = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const result = await deleteProject(id);

    if (!result.success) {
      return NextResponse.json({ error: toUserError(result.error || "Deletion failed") }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: toUserError(message) }, { status: 400 });
  }
}

/**
 * POST /api/projects/[id]
 * Performs actions on a project (deploy, restart, stop)
 * Body: { action: "deploy" | "restart" | "stop" }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Verify project belongs to user
  const existing = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    let result;

    switch (action) {
      case "deploy":
        result = await deployProject(id, {
          resumeFromStep: body.resumeFromStep,
        });
        break;
      case "restart":
        result = await restartProject(id);
        break;
      case "stop":
        result = await stopProject(id);
        break;
      default:
        return NextResponse.json(
          { error: "Invalid action. Use 'deploy', 'restart', or 'stop'" },
          { status: 400 }
        );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: toUserError(result.error || "Action failed"), logs: result.logs },
        { status: 400 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: toUserError(message) }, { status: 400 });
  }
}
