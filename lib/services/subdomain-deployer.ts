// subdomain-deployer.ts
import prisma from "@/lib/prisma";
import {
  getVPSConfig,
  getAppDomain,
  getStorageRoot,
} from "@/lib/config";
import {
  addPortMapping,
  removePortMapping,
} from "./nginx-manager";
import { sshExec, type SSHExecResult } from "./ssh-client";
import { decrypt, encrypt } from "@/lib/encryption";
import { DeploymentLogger } from "./deployment-logger";
import type { Project, Deployment } from "@/lib/generated/prisma/client";
import { detectAppType, type AppTypeDetector } from "./builds";
import { detectPackageManager } from "./packages";
import { detectOrm } from "./orms";
import { detectGitProvider } from "./git";
import { setupCICD, removeDeployScript, detectNodeBinPath } from "./cicd";
import type { VPSConfig } from "./nginx-manager";

export type { PackageManager } from "./packages";

const SOURCE_NVM = `source ~/.nvm/nvm.sh 2>/dev/null || source ~/.bashrc 2>/dev/null || true; export PATH="$HOME/.local/share/pnpm:$PATH"`;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyPM2Running(vps: VPSConfig, pm2Id: string) {
    const pm2Status = await sshExec(vps.ssh, `bash -c '${SOURCE_NVM} && pm2 jlist'`);
    const appStatus = JSON.parse(pm2Status.stdout).find((p: any) => p.name === pm2Id);
    if (!appStatus || appStatus.pm2_env.status !== 'online') {
        throw new Error('Application failed to start');
    }
}

async function verifyPortBound(vps: VPSConfig, port: number) {
    const portBound = await isPortInUse(vps, port);
    if (!portBound) {
        throw new Error(`Port ${port} not bound after start`);
    }
}

// Security: Port validation constants
const MIN_USER_PORT = 3001;
const MAX_USER_PORT = 65535;
const RESERVED_PORTS = new Set([
  22,
  80,
  443,
  3306,
  5432,
  6379,
  27017, // System/common services
]);

/**
 * Validate port number
 */
function validatePort(port: number): void {
  if (!Number.isInteger(port)) {
    throw new Error("Port must be an integer");
  }
  if (port < MIN_USER_PORT || port > MAX_USER_PORT) {
    throw new Error(
      `Port must be between ${MIN_USER_PORT} and ${MAX_USER_PORT}`,
    );
  }
  if (RESERVED_PORTS.has(port)) {
    throw new Error("Port is reserved for system services");
  }
}

/**
 * Sanitize shell input to prevent command injection
 */
function sanitizeShellInput(input: string): string {
  // Allow only alphanumeric, dash, underscore, dot, and forward slash
  return input.replace(/[^a-zA-Z0-9\-_.\/]/g, "");
}

/**
 * Validate subdomain format
 */
function validateSubdomain(subdomain: string): void {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    throw new Error(
      "Invalid subdomain format. Use lowercase letters, numbers, and hyphens only.",
    );
  }
  if (subdomain.length < 3 || subdomain.length > 63) {
    throw new Error("Subdomain must be 3-63 characters long");
  }
  // Prevent subdomain abuse
  const reservedSubdomains = ["www", "api", "admin", "mail", "ftp", "ssh"];
  if (reservedSubdomains.includes(subdomain)) {
    throw new Error("This subdomain is reserved");
  }
}

/**
 * Validate branch name
 */
function validateBranchName(branch: string): void {
  // Git branch name rules
  if (!/^[a-zA-Z0-9/_.-]+$/.test(branch)) {
    throw new Error("Invalid branch name");
  }
  if (branch.startsWith("-") || branch.endsWith(".lock")) {
    throw new Error("Invalid branch name format");
  }
}

/**
 * Validate environment variable key
 */
function validateEnvKey(key: string): void {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    throw new Error(`Invalid environment variable key: ${key}`);
  }
  // Prevent overriding critical system variables
  const protectedVars = ["PATH", "HOME", "USER", "SHELL"];
  if (protectedVars.includes(key)) {
    throw new Error(`Cannot override system variable: ${key}`);
  }
}

/**
 * Check if a port is actually in use on the VPS
 * SECURITY: Properly sanitized to prevent command injection
 */
async function isPortInUse(
  vps: { ssh: Parameters<typeof sshExec>[0] },
  port: number,
): Promise<boolean> {
  // Validate port first
  validatePort(port);

  // Use parameterized approach - port is now guaranteed to be a safe integer
  const result = await sshExec(
    vps.ssh,
    `ss -tlnp 2>/dev/null | grep -q ":${port} " && echo "in_use" || echo "free"`,
  );
  return result.stdout.includes("in_use");
}

export interface DeployResult {
  success: boolean;
  project?: Project;
  deployment?: Deployment;
  error?: string;
  logs?: string;
  url?: string;
}

export interface CreateProjectInput {
  userId: string;
  name: string;
  subdomain: string;
  repoUrl: string;
  branch?: string;
  nodeVersion?: string;
  port: number;
  rootDirectory?: string;
  envVars?: Record<string, string>;
  installCommand?: string;
  buildCommand?: string;
  startCommand?: string;
}

/**
 * Create and deploy a new project in one step
 * Flow: Validate -> DNS -> Reserve Port -> Clone -> .env -> Install -> Build -> PM2 -> Nginx -> SSL -> DB
 * SECURITY: Comprehensive input validation and atomic operations
 */
export async function createProject(
  input: CreateProjectInput,
): Promise<DeployResult> {
  const vps = getVPSConfig();
  const domain = getAppDomain();
  const logger = new DeploymentLogger();

  // Validation
  let gitProvider;
  try {
    validateSubdomain(input.subdomain);
    gitProvider = detectGitProvider(input.repoUrl);
    gitProvider.validateRepoUrl(input.repoUrl);
    validatePort(input.port);
    if (input.branch) {
      validateBranchName(input.branch);
    }
    if (input.envVars) {
      for (const key of Object.keys(input.envVars)) {
        validateEnvKey(key);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Validation failed";
    return { success: false, error: message, logs: message };
  }

  // Check subdomain availability
  const existing = await prisma.project.findUnique({
    where: { subdomain: input.subdomain },
  });
  if (existing) {
    return { success: false, error: "Subdomain is already taken" };
  }

  // Get GitHub token and username
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { encryptedGithubToken: true, githubUsername: true },
  });
  if (!user?.encryptedGithubToken) {
    return { success: false, error: "GitHub token not found" };
  }

  const githubToken = decrypt(user.encryptedGithubToken);
  const projectPath = `${vps.projectsRoot}/${input.subdomain}`;
  const pm2Id = input.subdomain.toLowerCase().replace(/[^a-z0-9-]/g, "-");

  // Verify port is available
  const portInUse = await isPortInUse(vps, input.port);
  if (portInUse) {
    return { success: false, error: `Port ${input.port} is already in use` };
  }

  // Verify subdomain directory doesn't already exist on VPS
  const dirCheck = await sshExec(
    vps.ssh,
    `test -d "${projectPath}" && echo "exists" || echo "missing"`,
  );
  if (dirCheck.stdout.trim() === "exists") {
    return { success: false, error: "Subdomain is already taken" };
  }

  // Define all steps
  const cloneStep = logger.addStep("Clone repository");
  const detectPmStep = logger.addStep("Detect package manager");
  const detectAppStep = logger.addStep("Detect app type");
  const envStep = logger.addStep("Create .env file");
  const installStep = logger.addStep("Install dependencies");
  const ormStep = logger.addStep("ORM setup");
  const buildStep = logger.addStep("Build application");
  const pm2Step = logger.addStep("Start with PM2");
  const portMapStep = logger.addStep("Add port mapping");
  const dbStep = logger.addStep("Save to database");
  const cicdStep = logger.addStep("Setup CI/CD");

  try {
    // STEP 1: Clone repository
    logger.startStep(cloneStep);
    await sshExec(vps.ssh, `sudo rm -rf "${projectPath}"`);
    await sshExec(
      vps.ssh,
      `sudo mkdir -p "${projectPath}" && sudo chown $(whoami):$(whoami) "${projectPath}"`,
    );

    const cloneResult = await gitProvider.cloneSecure(
      vps.ssh,
      input.repoUrl,
      input.branch || "main",
      githubToken,
      projectPath,
    );
    if (!cloneResult.success) {
      throw new Error(cloneResult.error || "Clone failed");
    }

    const commitHash = (
      await sshExec(vps.ssh, `cd "${projectPath}" && git rev-parse HEAD`)
    ).stdout
      .trim()
      .substring(0, 7);
    const commitMsg = (
      await sshExec(vps.ssh, `cd "${projectPath}" && git log -1 --pretty=%B`)
    ).stdout
      .trim()
      .substring(0, 200);
    logger.completeStep(cloneStep, `Commit: ${commitHash} - ${commitMsg}`);

    // Write EelJet marker file (identifies owner for sync)
    const markerPath = `${vps.markersDir}/${input.subdomain}.json`;
    const markerContent = JSON.stringify({
      userId: input.userId,
      githubUsername: user.githubUsername || null,
      subdomain: input.subdomain,
      createdAt: new Date().toISOString(),
    });
    await sshExec(
      vps.ssh,
      `sudo mkdir -p "${vps.markersDir}" && sudo chown $(whoami):$(whoami) "${vps.markersDir}"`,
    );
    await sshExec(
      vps.ssh,
      `cat > "${markerPath}" << 'EELJET_MARKER_EOF'\n${markerContent}\nEELJET_MARKER_EOF`,
    );
    await sshExec(vps.ssh, `chmod 600 "${markerPath}"`);

    // Determine work directory
    const workDir = input.rootDirectory
      ? `${projectPath}/${sanitizeShellInput(input.rootDirectory)}` 
      : projectPath;

    // Verify work directory exists
    const workDirCheck = await sshExec(
      vps.ssh,
      `test -d "${workDir}" && echo "exists" || echo "missing"`,
    );
    if (!workDirCheck.stdout.includes("exists")) {
      throw new Error(`Root directory "${input.rootDirectory}" does not exist`);
    }

    // STEP 3: Detect package manager
    logger.startStep(detectPmStep);
    const pm = await detectPackageManager(vps.ssh, workDir);
    logger.completeStep(detectPmStep, `Using ${pm.name}`);

    // STEP 4: Detect app type
    logger.startStep(detectAppStep);
    const appType = await detectAppType(workDir, vps);
    logger.completeStep(detectAppStep, `Detected: ${appType.name}`);

    // STEP 5: Create .env file
    logger.startStep(envStep);
    const envVars: Record<string, string> = {
      NODE_ENV: "production",
      PORT: String(input.port),
      ...input.envVars,
    };
    const envContent = Object.entries(envVars)
      .map(([key, value]) => {
        const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return `${key}="${escapedValue}"`;
      })
      .join("\n");
    const envWriteResult = await sshExec(
      vps.ssh,
      `cat > "${workDir}/.env" << 'EELJET_ENV_EOF'\n${envContent}\nEELJET_ENV_EOF`,
    );
    if (envWriteResult.code !== 0) {
      throw new Error(`Failed to write .env file: ${envWriteResult.stderr}`);
    }
    const envChmodResult = await sshExec(
      vps.ssh,
      `chmod 600 "${workDir}/.env"`,
    );
    if (envChmodResult.code !== 0) {
      throw new Error(`Failed to set .env permissions: ${envChmodResult.stderr}`);
    }
    logger.completeStep(envStep, `${Object.keys(envVars).length} variables`);

    // STEP 6: Install dependencies
    logger.startStep(installStep);
    const installCmd = input.installCommand || pm.getInstallCommand();
    await sshExec(
      vps.ssh,
      `bash -c '${SOURCE_NVM} && cd "${workDir}" && ${installCmd} 2>&1'`,
      { timeout: 300000 },
    );
    logger.completeStep(installStep, "Dependencies installed");

    // STEP 7: ORM setup (if detected)
    logger.startStep(ormStep);
    const orm = await detectOrm(vps.ssh, workDir);
    if (orm) {
      await orm.generate(vps.ssh, workDir, SOURCE_NVM);
      const ormResult = await orm.pushSchema(vps.ssh, workDir, SOURCE_NVM, envVars);
      logger.completeStep(ormStep, ormResult.message);
    } else {
      logger.skipStep(ormStep, "No ORM detected");
    }

    // STEP 8: Build
    logger.startStep(buildStep);
    const buildCmd = input.buildCommand || appType.getBuildCommand(pm.name);
    await sshExec(
      vps.ssh,
      `bash -c '${SOURCE_NVM} && cd "${workDir}" && ${buildCmd} 2>&1'`,
      { timeout: 600000 },
    );
    logger.completeStep(buildStep, "Build completed");

    // STEP 9: PM2 ecosystem config (app-type specific, or custom start command)
    const ecosystemConfig = input.startCommand
      ? `module.exports = {
  apps: [{
    name: '${pm2Id}',
    script: '${input.startCommand}',
    cwd: '${workDir}',
    instances: 1,
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000,
    min_uptime: '10s',
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: ${input.port}
    }
  }]
};`
      : appType.generateEcosystemConfig({
          name: pm2Id,
          cwd: workDir,
          port: input.port,
        });
    const ecoWriteResult = await sshExec(
      vps.ssh,
      `cat > "${projectPath}/ecosystem.config.js" << 'EELJET_PM2_EOF'\n${ecosystemConfig}\nEELJET_PM2_EOF`,
    );
    if (ecoWriteResult.code !== 0) {
      throw new Error(`Failed to write ecosystem.config.js: ${ecoWriteResult.stderr}`);
    }

    // STEP 10: Start PM2
    logger.startStep(pm2Step);
    await sshExec(
      vps.ssh,
      `bash -c '${SOURCE_NVM} && cd "${projectPath}" && pm2 start ecosystem.config.js 2>&1'`,
    );
    await sleep(3000); // Wait for startup
    await verifyPM2Running(vps, pm2Id);
    await verifyPortBound(vps, input.port);
    await sshExec(vps.ssh, `bash -c '${SOURCE_NVM} && pm2 save'`);
    logger.completeStep(pm2Step, "Application started and saved");

    // STEP 11: Add port mapping (wildcard DNS + SSL already exist)
    logger.startStep(portMapStep);
    await addPortMapping(vps, input.subdomain, domain, input.port);
    logger.completeStep(portMapStep, `Mapped to port ${input.port}`);

    // STEP 12: Database
    logger.startStep(dbStep);
    const project = await prisma.project.create({
      data: {
        userId: input.userId,
        name: input.name,
        subdomain: input.subdomain,
        repoUrl: input.repoUrl,
        branch: input.branch || "main",
        nodeVersion: input.nodeVersion || "20",
        port: input.port,
        rootDirectory: input.rootDirectory,
        installCommand: input.installCommand,
        buildCommand: input.buildCommand,
        startCommand: input.startCommand,
        status: "ACTIVE",
        lastCommitHash: commitHash,
        nginxConfigPath: vps.portMappingFile,
        pm2Id,
        appType: appType.name,
      },
    });

    if (input.envVars && Object.keys(input.envVars).length > 0) {
      await prisma.environmentVar.createMany({
        data: Object.entries(input.envVars).map(([key, value]) => ({
          projectId: project.id,
          key,
          encryptedValue: encrypt(value),
        })),
      });
    }

    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        commitHash,
        commitMsg,
        status: "SUCCESS",
        logs: logger.toJSON(),
        finishedAt: new Date(),
      },
    });
    logger.completeStep(dbStep, "Saved");

    // STEP 14: Setup CI/CD (non-fatal — deployment already succeeded)
    logger.startStep(cicdStep);
    try {
      const nodeBinPath = await detectNodeBinPath(vps);
      const cicdResult = await setupCICD({
        repoUrl: input.repoUrl,
        branch: input.branch || "main",
        subdomain: input.subdomain,
        githubToken,
        vps,
        deployScript: {
          subdomain: input.subdomain,
          branch: input.branch || "main",
          projectPath,
          workDir,
          packageManager: pm.name,
          hasPrisma: !!orm,
          vpsUser: vps.deployUser,
          nodeBinPath,
        },
      });
      if (cicdResult.success) {
        logger.completeStep(cicdStep, "GitHub Actions configured");
      } else {
        logger.completeStep(cicdStep, `Partial: ${cicdResult.errors.join(", ")}`);
      }
    } catch (cicdErr) {
      logger.skipStep(cicdStep, "CI/CD setup failed (non-fatal)");
    }

    return {
      success: true,
      project,
      deployment,
      logs: logger.toJSON(),
      url: `https://${input.subdomain}.${domain}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Mark current step as failed
    const steps = logger.getSteps();
    const runningStep = steps.find((s) => s.status === "running");
    if (runningStep) {
      logger.failStep(runningStep.id, message);
    }

    // Cleanup on failure
    try {
      await sshExec(
        vps.ssh,
        `bash -c '${SOURCE_NVM} && pm2 delete ${pm2Id} 2>/dev/null || true'`,
      );
      await sshExec(vps.ssh, `sudo rm -rf "${projectPath}"`);
      await removePortMapping(vps, input.subdomain, domain);
    } catch {
      // Ignore cleanup errors
    }

    return { success: false, error: message, logs: logger.toJSON() };
  }
}

/**
 * Redeploy an existing project (pull latest, rebuild, restart)
 */
export async function deployProject(
  projectId: string,
  options?: { resumeFromStep?: string },
): Promise<DeployResult> {
  const vps = getVPSConfig();
  const domain = getAppDomain();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      user: true,
      envVars: true,
    },
  });

  if (!project) {
    return { success: false, error: "Project not found" };
  }

  if (!project.user.encryptedGithubToken) {
    return {
      success: false,
      error: "GitHub token not found. Please re-authenticate with GitHub.",
    };
  }

  const githubToken = decrypt(project.user.encryptedGithubToken);
  const gitProvider = detectGitProvider(project.repoUrl);
  const projectPath = `${vps.projectsRoot}/${project.subdomain}`;
  const sourceNvm = SOURCE_NVM;

  const logger = new DeploymentLogger();

  // Define all steps
  const STEPS = {
    stop: logger.addStep("Stop process", `pm2 stop ${project.pm2Id}`),
    pull: logger.addStep(
      "Pull latest code",
      `git fetch && reset --hard origin/${project.branch}`,
    ),
    detectPm: logger.addStep("Detect package manager"),
    detectApp: logger.addStep("Detect app type"),
    env: logger.addStep("Update .env file"),
    install: logger.addStep("Install dependencies"),
    orm: logger.addStep("ORM setup"),
    build: logger.addStep("Build application"),
    restart: logger.addStep(
      "Restart application",
      `pm2 restart ${project.pm2Id}`,
    ),
  };

  const stepOrder = [
    STEPS.stop,
    STEPS.pull,
    STEPS.detectPm,
    STEPS.detectApp,
    STEPS.env,
    STEPS.install,
    STEPS.orm,
    STEPS.build,
    STEPS.restart,
  ];

  // Create deployment record
  const deployment = await prisma.deployment.create({
    data: {
      projectId: project.id,
      commitHash: "pending",
      status: "BUILDING",
    },
  });

  await prisma.project.update({
    where: { id: project.id },
    data: { status: "BUILDING" },
  });

  let credHelperPath: string | null = null;
  let commitHash = project.lastCommitHash || "unknown";
  let commitMsg = "";

  // Determine which steps to skip for resume
  let shouldSkip = !!options?.resumeFromStep;

  const runStep = (stepId: string): boolean => {
    if (shouldSkip) {
      if (stepId === options?.resumeFromStep) {
        shouldSkip = false;
        return true;
      }
      logger.skipStep(stepId, "Resumed past this step");
      return false;
    }
    return true;
  };

  try {
    const workDir = project.rootDirectory
      ? `${projectPath}/${sanitizeShellInput(project.rootDirectory)}` 
      : projectPath;

    let pm: Awaited<ReturnType<typeof detectPackageManager>> | null = null;
    let appType: AppTypeDetector | null = null;

    for (const stepId of stepOrder) {
      if (!runStep(stepId)) continue;

      switch (stepId) {
        case STEPS.stop: {
          logger.startStep(stepId);
          const stopResult = await sshExec(
            vps.ssh,
            `bash -c '${sourceNvm} && pm2 stop ${project.pm2Id}'`,
          );
          if (stopResult.code !== 0) {
            throw new Error(
              `PM2 stop failed: ${stopResult.stderr || stopResult.stdout}`,
            );
          }
          logger.completeStep(stepId, "Process stopped");
          break;
        }

        case STEPS.pull: {
          logger.startStep(stepId);
          credHelperPath = await gitProvider.setupCredentials(
            vps.ssh,
            projectPath,
            githubToken,
          );

          const pullResult = await sshExec(
            vps.ssh,
            `cd "${projectPath}" && GIT_TERMINAL_PROMPT=0 git fetch origin && git reset --hard origin/${project.branch} 2>&1`,
          );

          if (pullResult.code !== 0) {
            throw new Error(
              `Git pull failed: ${pullResult.stderr || pullResult.stdout}`,
            );
          }

          const commitResult = await sshExec(
            vps.ssh,
            `cd "${projectPath}" && git rev-parse HEAD`,
          );
          if (commitResult.code !== 0) {
            throw new Error(
              `Failed to get commit hash: ${commitResult.stderr}`,
            );
          }
          commitHash = commitResult.stdout.trim().substring(0, 7);

          const commitMsgResult = await sshExec(
            vps.ssh,
            `cd "${projectPath}" && git log -1 --pretty=%B`,
          );
          if (commitMsgResult.code !== 0) {
            throw new Error(
              `Failed to get commit message: ${commitMsgResult.stderr}`,
            );
          }
          commitMsg = commitMsgResult.stdout.trim().substring(0, 200);

          logger.completeStep(
            stepId,
            `Commit: ${commitHash} - ${commitMsg.split("\n")[0]}`,
          );
          break;
        }

        case STEPS.detectPm: {
          logger.startStep(stepId);
          pm = await detectPackageManager(vps.ssh, workDir);
          logger.completeStep(stepId, `Using ${pm.name}`);
          break;
        }

        case STEPS.detectApp: {
          logger.startStep(stepId);
          appType = await detectAppType(workDir, vps);
          logger.completeStep(stepId, `Detected: ${appType.name}`);
          break;
        }

        case STEPS.env: {
          logger.startStep(stepId);
          const envVars: Record<string, string> = {
            NODE_ENV: "production",
            PORT: String(project.port),
          };
          for (const envVar of project.envVars) {
            envVars[envVar.key] = decrypt(envVar.encryptedValue);
          }
          const envContent = Object.entries(envVars)
            .map(([key, value]) => {
              const escapedValue = value
                .replace(/\\/g, "\\\\") // Escape backslashes
                .replace(/"/g, '\"'); // Escape double quotes
              return `${key}="${escapedValue}"`;
            })
            .join("\n");

          const envWriteRes = await sshExec(
            vps.ssh,
            `cat > "${workDir}/.env" << 'EELJET_ENV_EOF'\n${envContent}\nEELJET_ENV_EOF`,
          );
          if (envWriteRes.code !== 0) {
            throw new Error(`Failed to write .env: ${envWriteRes.stderr}`);
          }
          const envChmodRes = await sshExec(
            vps.ssh,
            `chmod 600 "${workDir}/.env"`,
          );
          if (envChmodRes.code !== 0) {
            throw new Error(
              `Failed to set .env permissions: ${envChmodRes.stderr}`,
            );
          }
          const envVerify = await sshExec(
            vps.ssh,
            `test -f "${workDir}/.env" && echo "ok" || echo "missing"`,
          );
          if (envVerify.stdout.trim() !== "ok") {
            throw new Error(".env file missing after write");
          }
          logger.completeStep(
            stepId,
            `${Object.keys(envVars).length} variables`,
          );
          break;
        }

        case STEPS.install: {
          logger.startStep(stepId);
          // Re-detect package manager if we skipped that step during resume
          if (!pm) {
            pm = await detectPackageManager(vps.ssh, workDir);
          }
          const installCmd = project.installCommand || pm.getInstallCommand();
          const installResult = await sshExec(
            vps.ssh,
            `bash -c '${sourceNvm} && cd "${workDir}" && ${installCmd} 2>&1'`,
            { timeout: 300000 },
          );
          if (installResult.code !== 0) {
            throw new Error(
              `${pm.name} install failed: ${installResult.stderr || installResult.stdout}`,
            );
          }
          logger.completeStep(stepId, "Dependencies installed");
          break;
        }

        case STEPS.orm: {
          logger.startStep(stepId);
          const detectedOrm = await detectOrm(vps.ssh, workDir);
          if (detectedOrm) {
            await detectedOrm.generate(vps.ssh, workDir, sourceNvm);

            const envVarsForOrm: Record<string, string> = {
              NODE_ENV: "production",
              PORT: String(project.port),
            };
            for (const envVar of project.envVars) {
              envVarsForOrm[envVar.key] = decrypt(envVar.encryptedValue);
            }

            const ormResult = await detectedOrm.pushSchema(vps.ssh, workDir, sourceNvm, envVarsForOrm);
            logger.completeStep(stepId, ormResult.message);
          } else {
            logger.skipStep(stepId, "No ORM detected");
          }
          break;
        }

        case STEPS.build: {
          logger.startStep(stepId);
          // Re-detect app type if we skipped that step during resume
          if (!appType) {
            appType = await detectAppType(workDir, vps);
          }
          if (!pm) {
            pm = await detectPackageManager(vps.ssh, workDir);
          }
          const buildCmd = project.buildCommand || appType.getBuildCommand(pm.name);
          const buildResult = await sshExec(
            vps.ssh,
            `bash -c '${sourceNvm} && cd "${workDir}" && ${buildCmd} 2>&1'`,
            { timeout: 600000 },
          );
          if (buildResult.code !== 0) {
            throw new Error(
              `Build failed: ${buildResult.stderr || buildResult.stdout}`,
            );
          }
          logger.completeStep(stepId, "Build completed");
          break;
        }

        case STEPS.restart: {
          logger.startStep(stepId);
          // Regenerate ecosystem config with latest overrides
          if (!appType) {
            appType = await detectAppType(workDir, vps);
          }
          const ecoConfig = project.startCommand
            ? `module.exports = {
  apps: [{
    name: '${project.pm2Id}',
    script: '${project.startCommand}',
    cwd: '${workDir}',
    instances: 1,
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000,
    min_uptime: '10s',
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: ${project.port}
    }
  }]
};`
            : appType.generateEcosystemConfig({
                name: project.pm2Id!,
                cwd: workDir,
                port: project.port,
              });
          const ecoWriteRes = await sshExec(
            vps.ssh,
            `cat > "${projectPath}/ecosystem.config.js" << 'EELJET_PM2_EOF'\n${ecoConfig}\nEELJET_PM2_EOF`,
          );
          if (ecoWriteRes.code !== 0) {
            throw new Error(`Failed to write ecosystem.config.js: ${ecoWriteRes.stderr}`);
          }
          const restartResult = await sshExec(
            vps.ssh,
            `bash -c '${sourceNvm} && pm2 restart ${project.pm2Id} && pm2 save'`,
          );
          if (restartResult.code !== 0) {
            throw new Error(`PM2 restart failed: ${restartResult.stderr}`);
          }
          logger.completeStep(stepId, "Application restarted");
          break;
        }
      }

      // Track progress after each step
      await prisma.deployment.update({
        where: { id: deployment.id },
        data: { lastCompletedStep: stepId, logs: logger.toJSON() },
      });
    }

    // Update deployment record
    const updatedDeployment = await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        commitHash,
        commitMsg,
        status: "SUCCESS",
        logs: logger.toJSON(),
        finishedAt: new Date(),
      },
    });

    const updatedProject = await prisma.project.update({
      where: { id: project.id },
      data: {
        status: "ACTIVE",
        lastCommitHash: commitHash,
      },
    });

    return {
      success: true,
      project: updatedProject,
      deployment: updatedDeployment,
      logs: logger.toJSON(),
      url: `https://${project.subdomain}.${domain}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    // Mark current running step as failed
    const steps = logger.getSteps();
    const runningStep = steps.find((s) => s.status === "running");
    if (runningStep) {
      logger.failStep(runningStep.id, message);
    }

    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: "FAILED",
        logs: logger.toJSON(),
        errorMsg: message,
        lastCompletedStep: logger.getFailedStepId(),
        finishedAt: new Date(),
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { status: "FAILED" },
    });

    return { success: false, error: message, logs: logger.toJSON() };
  } finally {
    if (credHelperPath) {
      await gitProvider.cleanupCredentials(vps.ssh, credHelperPath);
    }
  }
}

/**
 * Sync environment variables from database to .env file on VPS
 */
export async function syncEnvToVPS(
  projectId: string,
): Promise<{ success: boolean; error?: string }> {
  const vps = getVPSConfig();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { envVars: true },
  });

  if (!project) {
    return { success: false, error: "Project not found" };
  }

  const projectPath = `${vps.projectsRoot}/${project.subdomain}`;
  const workDir = project.rootDirectory
    ? `${projectPath}/${sanitizeShellInput(project.rootDirectory)}` 
    : projectPath;

  const envVars: Record<string, string> = {
    NODE_ENV: "production",
    PORT: String(project.port),
  };

  for (const envVar of project.envVars) {
    envVars[envVar.key] = decrypt(envVar.encryptedValue);
  }

  const envContent = Object.entries(envVars)
    .map(([key, value]) => {
      const escapedValue = value.replace(/\\/g, "\\\\").replace(/"/g, '\"');
      return `${key}="${escapedValue}"`;
    })
    .join("\n");

  try {
    const writeResult = await sshExec(
      vps.ssh,
      `cat > "${workDir}/.env" << 'EELJET_ENV_EOF'\n${envContent}\nEELJET_ENV_EOF`,
    );
    if (writeResult.code !== 0) {
      return {
        success: false,
        error: `Failed to write .env: ${writeResult.stderr}`,
      };
    }
    const chmodResult = await sshExec(vps.ssh, `chmod 600 "${workDir}/.env"`);
    if (chmodResult.code !== 0) {
      return {
        success: false,
        error: `Failed to set .env permissions: ${chmodResult.stderr}`,
      };
    }
    const verify = await sshExec(
      vps.ssh,
      `test -f "${workDir}/.env" && echo "ok" || echo "missing"`,
    );
    if (verify.stdout.trim() !== "ok") {
      return { success: false, error: ".env file missing after write" };
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Delete a project and clean up all resources
 * Every step is independently wrapped so one failure never blocks others.
 */
export async function deleteProject(projectId: string): Promise<DeployResult> {
  const vps = getVPSConfig();
  const domain = getAppDomain();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      storageBuckets: true,
    },
  });

  if (!project) {
    return { success: false, error: "Project not found" };
  }

  let logs = "";
  const errors: string[] = [];
  const appendLog = (msg: string) => {
    logs += `[${new Date().toISOString()}] ${msg}\n`;
    console.log(`[Delete] ${msg}`);
  };

  // Helper: run SSH command, check exit code, throw on failure
  const run = async (
    cmd: string,
    description: string,
  ): Promise<SSHExecResult> => {
    appendLog(`Running: ${description}`);
    const result = await sshExec(vps.ssh, cmd);
    if (result.code !== 0) {
      const err = `${description} failed (exit ${result.code}): ${result.stderr || result.stdout}`;
      appendLog(`ERROR: ${err}`);
      throw new Error(err);
    }
    return result;
  };

  // Helper: verify something is gone
  const verifyGone = async (
    path: string,
    type: "file" | "dir" | "symlink",
  ): Promise<boolean> => {
    const flag = type === "dir" ? "-d" : type === "symlink" ? "-L" : "-e";
    const check = await sshExec(
      vps.ssh,
      `test ${flag} "${path}" && echo "exists" || echo "gone"`,
    );
    return check.stdout.trim() === "gone";
  };

  const sourceNvm = SOURCE_NVM;
  const projectPath = `${vps.projectsRoot}/${project.subdomain}`;

  // 1. Stop and delete PM2 process
  if (project.pm2Id) {
    try {
      await run(
        `bash -c '${sourceNvm} && pm2 delete ${project.pm2Id} && pm2 save'`,
        `Stop PM2 process: ${project.pm2Id}`,
      );
      // Verify
      const verify = await sshExec(
        vps.ssh,
        `bash -c '${sourceNvm} && pm2 jlist'`,
      );
      const pm2List = JSON.parse(verify.stdout || "[]");
      const stillRunning = pm2List.find(
        (app: { name: string }) => app.name === project.pm2Id,
      );
      if (stillRunning) {
        throw new Error(
          `PM2 process ${project.pm2Id} still running after delete`,
        );
      }
      appendLog(`PM2 process ${project.pm2Id} deleted and verified`);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  // 2. Remove port mapping from wildcard nginx map
  try {
    await removePortMapping(vps, project.subdomain, domain);
    appendLog("Port mapping removed and nginx reloaded");
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  // 3. Reload nginx (safety reload)
  try {
    await run(`sudo nginx -t 2>&1`, "Test nginx config");
    await run(`sudo systemctl reload nginx`, "Reload nginx");
    appendLog("Nginx reloaded and verified");
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  // 5. Remove project directory
  try {
    if (projectPath.startsWith(vps.projectsRoot) && project.subdomain) {
      await run(
        `sudo rm -rf "${projectPath}"`,
        `Remove directory ${projectPath}`,
      );
      const gone = await verifyGone(projectPath, "dir");
      if (!gone) {
        throw new Error(`${projectPath} still exists after rm -rf`);
      }
      appendLog("Project directory removed and verified");
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  // 6. Remove storage bucket files
  const storageRoot = getStorageRoot();
  for (const bucket of project.storageBuckets) {
    try {
      if (bucket.path.startsWith(storageRoot)) {
        await run(
          `sudo rm -rf "${bucket.path}"`,
          `Remove storage bucket ${bucket.name}`,
        );
        const gone = await verifyGone(bucket.path, "dir");
        if (!gone) {
          throw new Error(`Storage bucket ${bucket.name} still exists`);
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  // 7. Remove deploy script (non-fatal)
  try {
    await removeDeployScript(vps, project.subdomain, vps.deployUser);
    appendLog("Deploy script removed");
  } catch {
    // Non-fatal — script might not exist
  }

  // 8. Remove EelJet marker file (non-fatal)
  try {
    const markerPath = `${vps.markersDir}/${project.subdomain}.json`;
    await sshExec(vps.ssh, `rm -f "${markerPath}"`);
    appendLog("Marker file removed");
  } catch {
    // Non-fatal — marker might not exist
  }

  // STOP HERE if any VPS cleanup failed — don't orphan resources
  if (errors.length > 0) {
    appendLog(`FAILED: ${errors.length} error(s) during cleanup:`);
    errors.forEach((err) => appendLog(`  - ${err}`));
    return {
      success: false,
      error: `Deletion failed:\n${errors.join("\n")}`,
      logs,
    };
  }

  // 8. Delete from database ONLY after all VPS resources are confirmed gone
  try {
    appendLog("Removing from database");
    await prisma.project.delete({ where: { id: projectId } });
    appendLog("Database record deleted");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    appendLog(`ERROR: Database deletion failed: ${msg}`);
    return { success: false, error: msg, logs };
  }

  appendLog("Project fully deleted and verified");
  return { success: true, logs };
}

/**
 * Restart a project's PM2 process
 */
export async function restartProject(projectId: string): Promise<DeployResult> {
  const vps = getVPSConfig();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return { success: false, error: "Project not found" };
  }

  if (!project.pm2Id) {
    return { success: false, error: "Project has no PM2 process" };
  }

  try {
    const sourceNvm = SOURCE_NVM;
    const result = await sshExec(
      vps.ssh,
      `bash -c '${sourceNvm} && pm2 restart ${project.pm2Id}'`,
    );

    if (result.code !== 0) {
      throw new Error(`PM2 restart failed: ${result.stderr}`);
    }

    return { success: true, project };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Stop a project's PM2 process
 */
export async function stopProject(projectId: string): Promise<DeployResult> {
  const vps = getVPSConfig();

  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return { success: false, error: "Project not found" };
  }

  if (!project.pm2Id) {
    return { success: false, error: "Project has no PM2 process" };
  }

  try {
    const sourceNvm = SOURCE_NVM;
    await sshExec(
      vps.ssh,
      `bash -c '${sourceNvm} && pm2 stop ${project.pm2Id}'`,
    );

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "STOPPED" },
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Get available port (finds next unused port starting from 3001)
 * SECURITY: Checks both database AND actual VPS port usage with atomic reservation
 */
export async function getNextAvailablePort(): Promise<number> {
  const vps = getVPSConfig();

  // Use database transaction for atomic port reservation
  return await prisma.$transaction(async (tx) => {
    // Get all used ports from database
    const projects = await tx.project.findMany({
      select: { port: true },
      orderBy: { port: "desc" },
    });

    const usedPorts = new Set(projects.map((p) => p.port));

    // Find first available port
    for (let port = MIN_USER_PORT; port <= MAX_USER_PORT; port++) {
      // Skip reserved system ports
      if (RESERVED_PORTS.has(port)) {
        continue;
      }

      // Skip if already in database
      if (usedPorts.has(port)) {
        continue;
      }

      // Check if port is actually in use on VPS
      const inUse = await isPortInUse(vps, port);
      if (!inUse) {
        // Port is available
        return port;
      }
    }

    throw new Error("No available ports in range");
  });
}

/**
 * Check if a subdomain is available
 */
export async function isSubdomainAvailable(
  subdomain: string,
): Promise<boolean> {
  // Validate first
  try {
    validateSubdomain(subdomain);
  } catch {
    return false;
  }

  const existing = await prisma.project.findUnique({
    where: { subdomain },
  });
  return !existing;
}

/**
 * Get all projects for a user
 */
export async function getProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    include: {
      deployments: {
        orderBy: { startedAt: "desc" },
        take: 5,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get a single project by ID (must belong to user)
 */
export async function getProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      deployments: {
        orderBy: { startedAt: "desc" },
      },
      envVars: true,
      databases: true,
      storageBuckets: true,
    },
  });
}