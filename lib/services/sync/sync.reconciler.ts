import type { ProjectStatus } from "@/lib/generated/prisma/client";
import type { DiscoveredProject, SyncComparison } from "./sync.types";

interface DbProject {
  id: string;
  subdomain: string;
  name: string;
  status: ProjectStatus;
}

/**
 * Compare discovered VPS projects against database records.
 * Pure function — no side effects.
 */
export function reconcileProjects(
  discovered: DiscoveredProject[],
  dbProjects: DbProject[],
): SyncComparison {
  const dbBySubdomain = new Map(dbProjects.map((p) => [p.subdomain, p]));
  const discoveredSubdomains = new Set(discovered.map((d) => d.subdomain));

  const toImport: DiscoveredProject[] = [];
  const toReconcile: SyncComparison["toReconcile"] = [];
  const inSync: SyncComparison["inSync"] = [];

  for (const disc of discovered) {
    const dbProject = dbBySubdomain.get(disc.subdomain);

    if (!dbProject) {
      toImport.push(disc);
      continue;
    }

    const suggestedStatus = mapPm2ToProjectStatus(disc.pm2Status);
    const statusMismatch = dbProject.status !== suggestedStatus;

    if (statusMismatch) {
      toReconcile.push({
        discovered: disc,
        dbProjectId: dbProject.id,
        dbStatus: dbProject.status,
        suggestedStatus,
        statusMismatch: true,
      });
    } else {
      inSync.push({ id: dbProject.id, subdomain: dbProject.subdomain });
    }
  }

  // Orphaned: in DB but not on VPS
  const orphaned: SyncComparison["orphaned"] = dbProjects
    .filter((p) => !discoveredSubdomains.has(p.subdomain))
    .map((p) => ({
      id: p.id,
      subdomain: p.subdomain,
      name: p.name,
      status: p.status,
    }));

  return { toImport, toReconcile, orphaned, inSync };
}

function mapPm2ToProjectStatus(
  pm2Status: DiscoveredProject["pm2Status"],
): ProjectStatus {
  switch (pm2Status) {
    case "online":
      return "ACTIVE";
    case "stopped":
      return "STOPPED";
    case "errored":
      return "FAILED";
    case "not_found":
      return "STOPPED";
  }
}
