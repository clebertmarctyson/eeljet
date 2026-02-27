import type { SSHConfig } from "../ssh-client";

export interface CloneResult {
  success: boolean;
  error?: string;
}

export interface GitProvider {
  name: string;
  canHandle(repoUrl: string): boolean;
  validateRepoUrl(url: string): void;
  cloneSecure(
    ssh: SSHConfig,
    repoUrl: string,
    branch: string,
    token: string,
    destPath: string,
  ): Promise<CloneResult>;
  setupCredentials(
    ssh: SSHConfig,
    projectPath: string,
    token: string,
  ): Promise<string>;
  cleanupCredentials(ssh: SSHConfig, credHelperPath: string): Promise<void>;
}
