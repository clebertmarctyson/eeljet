import type { PackageManagerProvider } from "./package.manager";
import { sshExec, type SSHConfig } from "../ssh-client";

export class YarnProvider implements PackageManagerProvider {
  name = "yarn" as const;

  async detect(ssh: SSHConfig, workDir: string): Promise<boolean> {
    const result = await sshExec(
      ssh,
      `test -f "${workDir}/yarn.lock" && echo "exists" || true`,
    );
    return result.stdout.includes("exists");
  }

  getInstallCommand(): string {
    return "yarn install --frozen-lockfile || yarn install";
  }
}
