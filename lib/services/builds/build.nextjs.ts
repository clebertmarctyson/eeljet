import type { AppTypeDetector, EcosystemOptions } from "./build.pack";
import { sshExec } from "../ssh-client";
import type { PackageManager } from "../packages";
import type { VPSConfig } from "../nginx-manager";

export class NextJsApp implements AppTypeDetector {
  name = "Next.js";

  async detect(workDir: string, vps: VPSConfig): Promise<boolean> {
    // Check package.json for "next" dependency (works before npm install)
    const result = await sshExec(
      vps.ssh,
      `cat "${workDir}/package.json" 2>/dev/null || echo "{}"`,
    );
    try {
      const pkg = JSON.parse(result.stdout);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      return "next" in deps;
    } catch {
      return false;
    }
  }

  generateEcosystemConfig(options: EcosystemOptions): string {
    return `module.exports = {
  apps: [{
    name: '${options.name}',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '${options.cwd}',
    instances: 1,
    exec_mode: 'cluster',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000,
    min_uptime: '10s',
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: ${options.port}
    }
  }]
};`;
  }

  getBuildCommand(pm: PackageManager): string {
    switch (pm) {
      case "pnpm":
        return "pnpm build";
      case "yarn":
        return "yarn build";
      default:
        return "npm run build";
    }
  }

  getStartCommand(_pm: PackageManager): string {
    return "node_modules/next/dist/bin/next start";
  }
}
