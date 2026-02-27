import type { SSHConfig } from "../ssh-client";

export type PackageManager = "npm" | "yarn" | "pnpm";

export interface PackageManagerProvider {
  name: PackageManager;
  detect(ssh: SSHConfig, workDir: string): Promise<boolean>;
  getInstallCommand(): string;
}
