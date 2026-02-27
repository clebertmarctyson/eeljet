import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  createProject,
  getProjects,
  getNextAvailablePort,
} from "@/lib/services/subdomain-deployer";
import { toUserError } from "@/lib/services/error-messages";

const PLAN_PROJECT_LIMITS: Record<string, number> = {
  FREE: 5,
  PRO: 15,
};

/**
 * GET /api/projects
 * Returns all projects for the authenticated user
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await getProjects(session.user.id);
    return NextResponse.json(projects);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: toUserError(message) }, { status: 500 });
  }
}

/**
 * POST /api/projects
 * Creates and deploys a new project from a GitHub repo
 * Body: { name, subdomain, repoUrl, branch?, nodeVersion?, port?, rootDirectory?, envVars?, installCommand?, buildCommand?, startCommand? }
 */
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      name,
      subdomain,
      repoUrl,
      branch,
      nodeVersion,
      port,
      rootDirectory,
      envVars,
      installCommand,
      buildCommand,
      startCommand,
    } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { error: "name is required and must be a string" },
        { status: 400 }
      );
    }

    if (!subdomain || typeof subdomain !== "string") {
      return NextResponse.json(
        { error: "subdomain is required and must be a string" },
        { status: 400 }
      );
    }

    if (!repoUrl || typeof repoUrl !== "string") {
      return NextResponse.json(
        { error: "repoUrl is required and must be a string" },
        { status: 400 }
      );
    }

    // Validate subdomain format
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return NextResponse.json(
        {
          error:
            "Invalid subdomain format. Use only lowercase letters, numbers, and hyphens.",
        },
        { status: 400 }
      );
    }

    // Enforce project limit based on plan (admin bypasses)
    if (session.user.role !== "ADMIN") {
      const limit = PLAN_PROJECT_LIMITS[session.user.plan] ?? PLAN_PROJECT_LIMITS.FREE;
      const projectCount = await prisma.project.count({
        where: { userId: session.user.id },
      });
      if (projectCount >= limit) {
        return NextResponse.json(
          {
            error: `You've reached the ${session.user.plan} plan limit of ${limit} projects. Upgrade your plan to create more.`,
          },
          { status: 403 },
        );
      }
    }

    // Validate envVars if provided
    if (envVars && typeof envVars !== "object") {
      return NextResponse.json(
        { error: "envVars must be an object" },
        { status: 400 }
      );
    }

    // Get next available port if not provided
    const assignedPort = port || (await getNextAvailablePort());

    const result = await createProject({
      userId: session.user.id,
      name,
      subdomain: subdomain.toLowerCase(),
      repoUrl,
      branch,
      nodeVersion,
      port: assignedPort,
      rootDirectory,
      envVars: envVars || undefined,
      installCommand: installCommand || undefined,
      buildCommand: buildCommand || undefined,
      startCommand: startCommand || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: toUserError(result.error || "Deployment failed"), logs: result.logs },
        { status: 400 }
      );
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: toUserError(message) }, { status: 400 });
  }
}
