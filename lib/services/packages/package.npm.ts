import type { PackageManagerProvider } from "./package.manager";
import type { SSHConfig } from "../ssh-client";

export class NpmProvider implements PackageManagerProvider {
  name = "npm" as const;

  async detect(_ssh: SSHConfig, _workDir: string): Promise<boolean> {
    // npm is the fallback — always matches
    return true;
  }

  getInstallCommand(): string {
    return "npm ci || npm install";
  }
}
