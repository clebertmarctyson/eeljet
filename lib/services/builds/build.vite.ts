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
    script: '_eeljet_server.js',
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
    return "node _eeljet_server.js";
  }

  /**
   * A zero-dependency static file server written to workDir before PM2 start.
   * Serves files from dist/, falls back to index.html for SPA routing.
   */
  getServerScript(): string {
    return `'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const port = parseInt(process.env.PORT, 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.normalize(path.join(distDir, urlPath));

  // Path traversal guard
  if (!filePath.startsWith(distDir + path.sep) && filePath !== distDir) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  // Directory → index.html; missing file → SPA fallback to index.html
  try {
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    filePath = path.join(distDir, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const contentType = MIME[path.extname(filePath)] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}).listen(port, () => {
  console.log('EelJet static server listening on port ' + port);
});
`;
  }
}
