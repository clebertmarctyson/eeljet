import type { VPSConfig } from "../nginx-manager";

export interface CICDSetupResult {
  success: boolean;
  secretsSet: string[];
  workflowCreated: boolean;
  deployScriptCreated: boolean;
  errors: string[];
}

export interface DeployScriptOptions {
  subdomain: string;
  branch: string;
  projectPath: string;
  workDir: string;
  packageManager: string;
  hasPrisma: boolean;
  vpsUser: string;
  nodeBinPath: string;
}

export interface CICDSetupOptions {
  repoUrl: string;
  branch: string;
  subdomain: string;
  githubToken: string;
  vps: VPSConfig;
  deployScript: DeployScriptOptions;
}
