import type { PackageManager } from "../packages";
import type { VPSConfig } from "../nginx-manager";

export interface EcosystemOptions {
  name: string;
  cwd: string;
  port: number;
}

export interface AppTypeDetector {
  name: string;
  detect(workDir: string, vps: VPSConfig): Promise<boolean>;
  generateEcosystemConfig(options: EcosystemOptions): string;
  getBuildCommand(packageManager: PackageManager): string;
  getStartCommand(packageManager: PackageManager): string;
  /**
   * Returns the content of a server script to write to workDir before PM2
   * start, or null if the app type manages its own server (e.g. Next.js).
   * The file is written as `_eeljet_server.js` and referenced by the
   * ecosystem config via `script: '_eeljet_server.js'`.
   */
  getServerScript?(): string | null;
}
