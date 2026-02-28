import type { AppTypeDetector, EcosystemOptions } from "./build.pack";
import { sshExec } from "../ssh-client";
import type { PackageManager } from "../packages";
import type { VPSConfig } from "../nginx-manager";

export class ViteApp implements AppTypeDetector {
  name = "Vite";

  async detect(workDir: string, vps: VPSConfig): Promise<boolean> {
    const result = await sshExec(
      vps.ssh,
      `cat "${workDir}/package.json" 2>/dev/null || echo "{}"`,
    );
    try {
      const pkg = JSON.parse(result.stdout);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (!("vite" in deps)) return false;
    } catch {
      return false;
    }

    // Require a vite config file — the canonical marker of a Vite app.
    // This avoids false positives from projects that only use Vite as a
    // library bundler or Storybook dependency without being a Vite app.
    const configCheck = await sshExec(
      vps.ssh,
      `ls "${workDir}/vite.config.ts" "${workDir}/vite.config.js" "${workDir}/vite.config.mts" "${workDir}/vite.config.mjs" 2>/dev/null | head -1`,
    );
    return configCheck.stdout.trim().length > 0;
  }

  generateEcosystemConfig(options: EcosystemOptions): string {
    return `module.exports = {
  apps: [{
    name: '${options.name}',
    script: 'npx',
    args: 'serve dist -s -l ${options.port}',
    cwd: '${options.cwd}',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000,
    min_uptime: '10s',
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
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
    return "npx serve dist -s";
  }
}
