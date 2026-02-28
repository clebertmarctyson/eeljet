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
 * Removes a project and all its resources — streams progress via SSE
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

  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();

  const send = (event: Record<string, unknown>) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  (async () => {
    try {
      const result = await deleteProject(id, (log) => {
        send({ type: "log", log });
      });
      if (!result.success) {
        send({ type: "error", error: toUserError(result.error || "Deletion failed") });
      } else {
        send({ type: "complete" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      send({ type: "error", error: toUserError(message) });
    } finally {
      writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
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

    if (!["deploy", "restart", "stop"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Use 'deploy', 'restart', or 'stop'" },
        { status: 400 },
      );
    }

    const encoder = new TextEncoder();
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const writer = stream.writable.getWriter();

    const send = (event: Record<string, unknown>) => {
      writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    };

    (async () => {
      try {
        let result;
        if (action === "deploy") {
          result = await deployProject(id, {
            resumeFromStep: body.resumeFromStep,
            onProgress: (steps, textLog) => {
              send({ type: "progress", steps, textLog });
            },
          });
        } else if (action === "restart") {
          result = await restartProject(id);
        } else {
          result = await stopProject(id);
        }
        if (!result.success) {
          send({ type: "error", error: toUserError(result.error || "Action failed"), logs: result.logs });
        } else {
          send({ type: "complete", ...result });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        send({ type: "error", error: toUserError(message) });
      } finally {
        writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: toUserError(message) }, { status: 400 });
  }
}
