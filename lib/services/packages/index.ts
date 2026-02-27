import type { PackageManagerProvider } from "./package.manager";
import type { SSHConfig } from "../ssh-client";
import { PnpmProvider } from "./package.pnpm";
import { YarnProvider } from "./package.yarn";
import { NpmProvider } from "./package.npm";

export type { PackageManagerProvider } from "./package.manager";
export type { PackageManager } from "./package.manager";

// Order matters: pnpm first (most specific), then yarn, npm as fallback
const PACKAGE_MANAGERS: PackageManagerProvider[] = [
  new PnpmProvider(),
  new YarnProvider(),
  new NpmProvider(),
];

export async function detectPackageManager(
  ssh: SSHConfig,
  workDir: string,
): Promise<PackageManagerProvider> {
  for (const pm of PACKAGE_MANAGERS) {
    if (await pm.detect(ssh, workDir)) {
      return pm;
    }
  }
  // NpmProvider always matches, so this is unreachable
  return PACKAGE_MANAGERS[PACKAGE_MANAGERS.length - 1];
}
