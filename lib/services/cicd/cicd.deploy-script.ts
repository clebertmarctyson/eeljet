import { sshExec } from "../ssh-client";
import type { VPSConfig } from "../nginx-manager";
import type { DeployScriptOptions } from "./cicd.types";

/**
 * Detect the absolute path to the node binary directory on the VPS.
 * e.g. "/home/user/.nvm/versions/node/v24.13.0/bin"
 */
export async function detectNodeBinPath(
  vps: VPSConfig,
): Promise<string> {
  const result = await sshExec(
    vps.ssh,
    `bash -c 'source ~/.nvm/nvm.sh 2>/dev/null || true; dirname "$(which node)"'`,
  );
  const binPath = result.stdout.trim();
  if (!binPath || binPath === ".") {
    throw new Error("Could not detect node binary path on VPS");
  }
  return binPath;
}

/**
 * Generate and write a per-project deploy script to the VPS.
 */
export async function createDeployScript(
  vps: VPSConfig,
  options: DeployScriptOptions,
): Promise<void> {
  const {
    subdomain,
    branch,
    projectPath,
    workDir,
    packageManager,
    hasPrisma,
    vpsUser,
    nodeBinPath,
  } = options;

  const installCmd =
    packageManager === "pnpm"
      ? "pnpm install --frozen-lockfile"
      : packageManager === "yarn"
        ? "yarn install --frozen-lockfile"
        : "npm ci";

  const buildCmd =
    packageManager === "pnpm"
      ? "pnpm build"
      : packageManager === "yarn"
        ? "yarn build"
        : "npm run build";

  const runCmd =
    packageManager === "pnpm"
      ? "pnpm"
      : packageManager === "yarn"
        ? "yarn"
        : "npm run";

  const needsCd = workDir !== projectPath;

  let prismaBlock = "";
  if (hasPrisma) {
    prismaBlock = `
# 4. Run database migrations and generate client
echo "Running database migrations..."
${runCmd} db:generate
${runCmd} db:push
`;
  }

  const script = `#!/bin/bash
set -e

# Load both NVM (for node) and pnpm global bin (for pm2)
export PATH="${nodeBinPath}:/home/${vpsUser}/.local/share/pnpm:$PATH"

echo "Starting deployment..."

# Navigate to app directory
cd "${projectPath}"

# 1. Reset local changes
echo "Resetting local changes..."
git reset --hard

# 2. Pull latest changes
echo "Pulling latest code from GitHub..."
git pull origin ${branch}
${needsCd ? `\n# Navigate to work directory\ncd "${workDir}"\n` : ""}
# 3. Install dependencies
echo "Installing dependencies..."
${installCmd}
${prismaBlock}
# ${hasPrisma ? "5" : "4"}. Build application
echo "Building application..."
${buildCmd}
${needsCd ? `\n# Return to project root\ncd "${projectPath}"\n` : ""}
# ${hasPrisma ? "6" : "5"}. Restart PM2 application
echo "Restarting application..."
pm2 startOrRestart ecosystem.config.js

echo "Deployment completed successfully at $(date)"`;

  const scriptPath = `/home/${vpsUser}/${subdomain}_deploy.sh`;

  await sshExec(
    vps.ssh,
    `cat > "${scriptPath}" << 'EELJET_DEPLOY_EOF'\n${script}\nEELJET_DEPLOY_EOF`,
  );
  await sshExec(vps.ssh, `chmod +x "${scriptPath}"`);
}

/**
 * Remove a project's deploy script from the VPS.
 */
export async function removeDeployScript(
  vps: VPSConfig,
  subdomain: string,
  vpsUser: string,
): Promise<void> {
  const scriptPath = `/home/${vpsUser}/${subdomain}_deploy.sh`;
  await sshExec(vps.ssh, `rm -f "${scriptPath}"`);
}
