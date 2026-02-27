import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string; deploymentId: string }>;
};

/**
 * GET /api/projects/[id]/deployments/[deploymentId]
 * Get deployment details with structured logs
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, deploymentId } = await context.params;

  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const deployment = await prisma.deployment.findFirst({
    where: { id: deploymentId, projectId: id },
  });

  if (!deployment) {
    return NextResponse.json(
      { error: "Deployment not found" },
      { status: 404 },
    );
  }

  // Parse structured logs if available
  let steps = null;
  let textLog = null;

  if (deployment.logs) {
    try {
      const parsed = JSON.parse(deployment.logs);
      steps = parsed.steps || null;
      textLog = parsed.textLog || null;
    } catch {
      // Old-format plain text logs
      textLog = deployment.logs;
    }
  }

  return NextResponse.json({
    id: deployment.id,
    commitHash: deployment.commitHash,
    commitMsg: deployment.commitMsg,
    status: deployment.status,
    steps,
    textLog,
    errorMsg: deployment.errorMsg,
    lastCompletedStep: deployment.lastCompletedStep,
    startedAt: deployment.startedAt,
    finishedAt: deployment.finishedAt,
  });
}
