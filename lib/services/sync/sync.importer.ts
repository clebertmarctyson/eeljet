import prisma from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import type { ProjectStatus } from "@/lib/generated/prisma/client";
import type { VPSConfig } from "../nginx-manager";
import { setupCICD, detectNodeBinPath, parseGitHubRepo } from "../cicd";
import { detectPackageManager } from "../packages";
import { detectOrm } from "../orms";
import type {
  DiscoveredProject,
  SyncImportResult,
  SyncComparison,
  SyncResult,
  SyncProgressCallback,
} from "./sync.types";

const GITHUB_API = "https://api.github.com";

/**
 * Fetch the default branch for a GitHub repo via API.
 * Returns null if the request fails (non-fatal).
 */
async function getGitHubDefaultBranch(
  repoUrl: string,
  token: string,
): Promise<string | null> {
  try {
    const { owner, repo } = parseGitHubRepo(repoUrl);
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.default_branch || null;
  } catch {
    return null;
  }
}

/**
 * Import discovered projects into the database and set up CI/CD.
 * Idempotent: skips projects whose subdomain already exists.
 */
export async function importProjects(
  toImport: DiscoveredProject[],
  userId: string,
  vps: VPSConfig,
  onProgress?: SyncProgressCallback,
): Promise<SyncImportResult[]> {
  const results: SyncImportResult[] = [];

  // Pre-fetch user's GitHub token and node bin path for CI/CD setup
  let githubToken: string | null = null;
  let nodeBinPath: string | null = null;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { encryptedGithubToken: true },
    });
    if (user?.encryptedGithubToken) {
      githubToken = decrypt(user.encryptedGithubToken);
    }
  } catch {
    // Non-fatal: CI/CD setup will be skipped
  }

  try {
    nodeBinPath = await detectNodeBinPath(vps);
  } catch {
    // Non-fatal: CI/CD setup will be skipped
  }

  for (let i = 0; i < toImport.length; i++) {
    const disc = toImport[i];
    const current = i + 1;
    const total = toImport.length;

    onProgress?.({ type: "importing", current, total, subdomain: disc.subdomain });

    try {
      // Idempotency check
      const existing = await prisma.project.findUnique({
        where: { subdomain: disc.subdomain },
      });
      if (existing) {
        results.push({
          subdomain: disc.subdomain,
          success: true,
          projectId: existing.id,
          error: "Already exists",
        });
        continue;
      }

      const status = mapPm2ToProjectStatus(disc.pm2Status);

      // Resolve branch from GitHub API (more reliable than local checkout)
      let branch = disc.branch || "main";
      if (githubToken && disc.repoUrl && disc.repoUrl !== "unknown") {
        const defaultBranch = await getGitHubDefaultBranch(
          disc.repoUrl,
          githubToken,
        );
        if (defaultBranch) {
          branch = defaultBranch;
        }
      }

      const project = await prisma.project.create({
        data: {
          userId,
          name: disc.projectName || disc.subdomain,
          subdomain: disc.subdomain,
          repoUrl: disc.repoUrl || "unknown",
          branch,
          nodeVersion: "20",
          port: disc.port,
          rootDirectory: disc.rootDirectory,
          status,
          lastCommitHash: disc.commitHash,
          nginxConfigPath: disc.nginxConfigPath,
          pm2Id: disc.pm2Id || disc.subdomain,
          appType: disc.appType,
        },
      });

      // Import environment variables
      const envEntries = Object.entries(disc.envVars);
      if (envEntries.length > 0) {
        await prisma.environmentVar.createMany({
          data: envEntries.map(([key, value]) => ({
            projectId: project.id,
            key,
            encryptedValue: encrypt(value),
          })),
        });
      }

      // Create a synthetic deployment record
      await prisma.deployment.create({
        data: {
          projectId: project.id,
          commitHash: disc.commitHash || "synced",
          commitMsg: "Imported via VPS sync",
          status: "SUCCESS",
          finishedAt: new Date(),
        },
      });

      // Set up CI/CD (non-fatal)
      if (githubToken && nodeBinPath && disc.repoUrl && disc.repoUrl !== "unknown") {
        try {
          const workDir = disc.ecosystemCwd || disc.projectPath;

          const pm = await detectPackageManager(vps.ssh, workDir);
          const orm = await detectOrm(vps.ssh, workDir);

          await setupCICD({
            repoUrl: disc.repoUrl,
            branch,
            subdomain: disc.subdomain,
            githubToken,
            vps,
            deployScript: {
              subdomain: disc.subdomain,
              branch,
              projectPath: disc.projectPath,
              workDir,
              packageManager: pm.name,
              hasPrisma: !!orm,
              vpsUser: vps.deployUser,
              nodeBinPath,
            },
          });
        } catch {
          // CI/CD setup is non-fatal during sync
        }
      }

      results.push({
        subdomain: disc.subdomain,
        success: true,
        projectId: project.id,
      });
      onProgress?.({ type: "imported", current, total, subdomain: disc.subdomain, success: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({
        subdomain: disc.subdomain,
        success: false,
        error,
      });
      onProgress?.({ type: "imported", current, total, subdomain: disc.subdomain, success: false, error });
    }
  }

  return results;
}

/**
 * Update database status for projects whose PM2 status doesn't match.
 */
export async function reconcileStatuses(
  toReconcile: SyncComparison["toReconcile"],
): Promise<SyncResult["reconciled"]> {
  const results: SyncResult["reconciled"] = [];

  for (const item of toReconcile) {
    try {
      await prisma.project.update({
        where: { id: item.dbProjectId },
        data: { status: item.suggestedStatus },
      });

      results.push({
        subdomain: item.discovered.subdomain,
        projectId: item.dbProjectId,
        statusUpdated: true,
        oldStatus: item.dbStatus,
        newStatus: item.suggestedStatus,
      });
    } catch {
      results.push({
        subdomain: item.discovered.subdomain,
        projectId: item.dbProjectId,
        statusUpdated: false,
        oldStatus: item.dbStatus,
        newStatus: item.suggestedStatus,
      });
    }
  }

  return results;
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
