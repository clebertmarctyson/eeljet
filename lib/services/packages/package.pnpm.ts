import type { PackageManagerProvider } from "./package.manager";
import { sshExec, type SSHConfig } from "../ssh-client";

export class PnpmProvider implements PackageManagerProvider {
  name = "pnpm" as const;

  async detect(ssh: SSHConfig, workDir: string): Promise<boolean> {
    const result = await sshExec(
      ssh,
      `test -f "${workDir}/pnpm-lock.yaml" && echo "exists" || true`,
    );
    return result.stdout.includes("exists");
  }

  getInstallCommand(): string {
    return "pnpm install --frozen-lockfile || pnpm install";
  }
}
