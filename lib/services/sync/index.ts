import { getVPSConfig, getAppDomain } from "@/lib/config";
import prisma from "@/lib/prisma";
import { discoverVPSProjects } from "./sync.discovery";
import { reconcileProjects } from "./sync.reconciler";
import { importProjects, reconcileStatuses } from "./sync.importer";
import type { SyncResult, SyncProgressCallback } from "./sync.types";

export type { SyncResult, SyncProgressEvent, SyncProgressCallback } from "./sync.types";

/**
 * Sync projects from VPS into the database.
 * Matches projects to users by git remote URL owner (primary) or marker userId (fallback).
 * Discovers deployed projects, imports missing ones, reconciles statuses.
 */
export async function syncProjects(
  userId: string,
  onProgress?: SyncProgressCallback,
): Promise<SyncResult> {
  const vps = getVPSConfig();
  const domain = getAppDomain();
  const errors: string[] = [];

  // Get the user's GitHub username for git remote matching
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubUsername: true },
  });
  const githubUsername = user?.githubUsername?.toLowerCase() || null;

  // Step 1: Discover what's on the VPS
  onProgress?.({ type: "discovering" });
  const { projects: allDiscovered, errors: discoveryErrors } =
    await discoverVPSProjects(vps, domain);
  errors.push(...discoveryErrors);

  // Step 2: Filter to projects owned by this user
  // Primary: match by git remote URL owner (survives DB wipes)
  // Fallback: match by marker userId (for projects without a valid repoUrl)
  const discovered = allDiscovered.filter((p) => {
    if (githubUsername && p.repoOwner) {
      return p.repoOwner.toLowerCase() === githubUsername;
    }
    return p.ownerUserId === userId;
  });

  onProgress?.({
    type: "discovered",
    total: discovered.length,
    subdomains: discovered.map((p) => p.subdomain),
  });

  // Step 3: Get all projects from database (all users — subdomain is globally unique)
  const dbProjects = await prisma.project.findMany({
    select: { id: true, subdomain: true, name: true, status: true },
  });

  // Step 4: Compare
  const comparison = reconcileProjects(discovered, dbProjects);

  // Step 5: Import new projects and set up CI/CD (assigned to requesting user)
  const imported = await importProjects(
    comparison.toImport,
    userId,
    vps,
    onProgress,
  );

  // Step 6: Reconcile statuses
  onProgress?.({ type: "reconciling" });
  const reconciled = await reconcileStatuses(comparison.toReconcile);

  const result: SyncResult = {
    success: errors.length === 0 && imported.every((r) => r.success),
    discovered: discovered.length,
    imported,
    reconciled,
    orphaned: comparison.orphaned.map((o) => ({
      id: o.id,
      subdomain: o.subdomain,
      name: o.name,
    })),
    alreadyInSync: comparison.inSync.length,
    errors,
  };

  onProgress?.({ type: "complete", result });

  return result;
}
