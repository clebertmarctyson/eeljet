import type { ProjectStatus } from "@/lib/generated/prisma/client";

export interface DiscoveredProject {
  subdomain: string;
  domain: string;
  port: number;
  /** Path to the port mapping file (wildcard nginx map) */
  nginxConfigPath: string;

  // From .eeljet.json marker (fallback ownership identification)
  ownerUserId: string | null;

  // From git
  repoUrl: string | null;
  repoOwner: string | null; // GitHub username extracted from git remote URL
  branch: string | null;
  commitHash: string | null;

  // From PM2
  pm2Id: string | null;
  pm2Status: "online" | "stopped" | "errored" | "not_found";

  // From ecosystem.config.js
  ecosystemPort: number | null;
  ecosystemCwd: string | null;

  // From package.json
  projectName: string | null;
  appType: string | null;

  // From .env (raw key=value, excluding NODE_ENV/PORT)
  envVars: Record<string, string>;

  // Filesystem
  projectPath: string;
  hasProjectDir: boolean;
  hasSslCert: boolean;
  rootDirectory: string | null;
}

export interface SyncComparison {
  toImport: DiscoveredProject[];

  toReconcile: {
    discovered: DiscoveredProject;
    dbProjectId: string;
    dbStatus: ProjectStatus;
    suggestedStatus: ProjectStatus;
    statusMismatch: boolean;
  }[];

  orphaned: {
    id: string;
    subdomain: string;
    name: string;
    status: ProjectStatus;
  }[];

  inSync: {
    id: string;
    subdomain: string;
  }[];
}

export interface SyncImportResult {
  subdomain: string;
  success: boolean;
  projectId?: string;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  discovered: number;
  imported: SyncImportResult[];
  reconciled: {
    subdomain: string;
    projectId: string;
    statusUpdated: boolean;
    oldStatus: string;
    newStatus: string;
  }[];
  orphaned: {
    id: string;
    subdomain: string;
    name: string;
  }[];
  alreadyInSync: number;
  errors: string[];
}

/** Server-Sent Event types for real-time sync progress */
export type SyncProgressEvent =
  | { type: "discovering" }
  | { type: "discovered"; total: number; subdomains: string[] }
  | { type: "importing"; current: number; total: number; subdomain: string }
  | { type: "imported"; current: number; total: number; subdomain: string; success: boolean; error?: string }
  | { type: "reconciling" }
  | { type: "complete"; result: SyncResult };

export type SyncProgressCallback = (event: SyncProgressEvent) => void;
