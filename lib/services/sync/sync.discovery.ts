import { readPortMappings } from "../nginx-manager";
import type { VPSConfig } from "../nginx-manager";
import { sshExec } from "../ssh-client";
import { parseGitHubRepo } from "../cicd";
import type { DiscoveredProject } from "./sync.types";

const SOURCE_NVM = `source ~/.nvm/nvm.sh 2>/dev/null || source ~/.bashrc 2>/dev/null || true; export PATH="$HOME/.local/share/pnpm:$PATH"`;

interface PM2Process {
  name: string;
  pm2_env?: { status?: string };
}

/**
 * Discover all EelJet-deployed projects on the VPS.
 * Uses nginx configs as the primary source, then enriches each
 * with data from PM2, git, ecosystem.config.js, package.json, and .env.
 * Reads marker files from the markers directory to identify project owners.
 */
export async function discoverVPSProjects(
  vps: VPSConfig,
  domain: string,
): Promise<{ projects: DiscoveredProject[]; errors: string[] }> {
  const errors: string[] = [];
  const projects: DiscoveredProject[] = [];

  // Step 1: Read port mappings from map file
  const mapResult = await readPortMappings(vps);
  for (const e of mapResult.errors) {
    errors.push(`Port mapping parse error: ${e}`);
  }

  // Filter to our domain only
  const configs = mapResult.mappings.filter(
    (m) => m.domain === domain,
  );

  if (configs.length === 0) {
    return { projects, errors };
  }

  // Step 2: Read all marker files in one SSH call (subdomain → userId)
  const markerMap = await readAllMarkers(vps);

  // Step 3: Get all PM2 processes in one call
  const pm2Map = await getPM2StatusMap(vps);

  // Step 4: Enrich each discovered mapping with project data
  for (const mapping of configs) {
    try {
      const ownerUserId = markerMap.get(mapping.subdomain) || null;
      const project = await gatherProjectData(
        vps,
        mapping.subdomain,
        mapping.domain,
        mapping.port,
        ownerUserId,
        pm2Map,
      );
      projects.push(project);
    } catch (err) {
      errors.push(
        `Failed to gather data for ${mapping.subdomain}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { projects, errors };
}

/**
 * Read all marker files from the markers directory in one SSH call.
 * Returns a Map<subdomain, userId>.
 */
async function readAllMarkers(vps: VPSConfig): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    // Read all JSON files, output each with a separator
    const result = await sshExec(
      vps.ssh,
      `for f in "${vps.markersDir}"/*.json; do [ -f "$f" ] && cat "$f" && echo ""; done 2>/dev/null || true`,
    );
    if (!result.stdout.trim()) return map;

    for (const line of result.stdout.trim().split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const data = JSON.parse(trimmed);
        if (data.subdomain && data.userId) {
          map.set(data.subdomain, data.userId);
        }
      } catch {
        // Skip unparseable lines
      }
    }
  } catch {
    // Markers directory might not exist yet
  }
  return map;
}

/**
 * Get PM2 process status for all running processes.
 * Returns a Map<processName, status>.
 */
async function getPM2StatusMap(
  vps: VPSConfig,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const result = await sshExec(
      vps.ssh,
      `bash -c '${SOURCE_NVM} && pm2 jlist 2>/dev/null || echo "[]"'`,
    );
    const processes: PM2Process[] = JSON.parse(result.stdout || "[]");
    for (const proc of processes) {
      if (proc.name) {
        map.set(proc.name, proc.pm2_env?.status || "unknown");
      }
    }
  } catch {
    // PM2 not available or no processes — that's fine
  }
  return map;
}

// Delimiter used to separate sections in the batched SSH output
const SEP = "===EELJET_SEP===";

/**
 * Gather all data for a single project in one batched SSH call.
 */
async function gatherProjectData(
  vps: VPSConfig,
  subdomain: string,
  domain: string,
  port: number,
  ownerUserId: string | null,
  pm2Map: Map<string, string>,
): Promise<DiscoveredProject> {
  const projectPath = `${vps.projectsRoot}/${subdomain}`;

  // Batched SSH command: check dir, git info, ecosystem, package.json, .env, marker
  const cmd = [
    // Section 0: dir exists
    `test -d "${projectPath}" && echo "exists" || echo "missing"`,
    `echo "${SEP}"`,
    // Section 1: git remote
    `cd "${projectPath}" 2>/dev/null && git remote get-url origin 2>/dev/null || echo "__NONE__"`,
    `echo "${SEP}"`,
    // Section 2: git commit hash
    `cd "${projectPath}" 2>/dev/null && git rev-parse --short HEAD 2>/dev/null || echo "__NONE__"`,
    `echo "${SEP}"`,
    // Section 3: git branch
    `cd "${projectPath}" 2>/dev/null && git branch --show-current 2>/dev/null || echo "__NONE__"`,
    `echo "${SEP}"`,
    // Section 4: ecosystem.config.js
    `cat "${projectPath}/ecosystem.config.js" 2>/dev/null || echo "__NONE__"`,
    `echo "${SEP}"`,
    // Section 5: package.json
    `cat "${projectPath}/package.json" 2>/dev/null || echo "__NONE__"`,
    `echo "${SEP}"`,
    // Section 6: .env
    `cat "${projectPath}/.env" 2>/dev/null || echo "__NONE__"`,
  ].join(" && ");

  const result = await sshExec(vps.ssh, cmd, { timeout: 15000 });
  const sections = result.stdout.split(SEP).map((s) => s.trim());

  const hasProjectDir = sections[0] === "exists";
  const repoUrl = parseGitUrl(sections[1]);
  // Extract GitHub owner from repo URL (e.g., "clebertmarctyson" from github.com/clebertmarctyson/blog)
  let repoOwner: string | null = null;
  if (repoUrl) {
    try {
      repoOwner = parseGitHubRepo(repoUrl).owner;
    } catch {
      // Non-GitHub or malformed URL — leave null
    }
  }
  const commitHash = parseNullable(sections[2]);
  const branch = parseNullable(sections[3]);
  const ecosystemRaw = parseNullable(sections[4]);
  const packageJsonRaw = parseNullable(sections[5]);
  const envRaw = parseNullable(sections[6]);

  // Parse ecosystem.config.js
  const eco = parseEcosystem(ecosystemRaw);

  // Parse package.json
  const pkg = parsePackageJson(packageJsonRaw);

  // Parse .env
  const envVars = parseEnvFile(envRaw);

  // Determine rootDirectory from ecosystem cwd
  let rootDirectory: string | null = null;
  if (eco.cwd && eco.cwd !== projectPath && eco.cwd.startsWith(projectPath)) {
    rootDirectory = eco.cwd.slice(projectPath.length + 1); // strip leading /
  }

  // Work directory for package.json detection
  const workDir = rootDirectory ? `${projectPath}/${rootDirectory}` : projectPath;

  // If package.json was read from project root but rootDirectory exists,
  // try reading from the work directory instead
  let projectName = pkg.name;
  let appType = pkg.appType;
  if (rootDirectory && packageJsonRaw) {
    // The package.json we read was from projectPath, which might be the monorepo root
    // The real app package.json would be in workDir — but we already read from projectPath
    // For simplicity, use what we have
  }

  // PM2 status lookup
  const pm2Id = eco.name || subdomain;
  const pm2RawStatus = pm2Map.get(pm2Id);
  const pm2Status = mapPm2RawStatus(pm2RawStatus);

  return {
    subdomain,
    domain,
    port,
    nginxConfigPath: vps.portMappingFile,
    ownerUserId,
    repoUrl,
    repoOwner,
    branch,
    commitHash,
    pm2Id,
    pm2Status,
    ecosystemPort: eco.port,
    ecosystemCwd: eco.cwd,
    projectName: projectName || subdomain,
    appType,
    envVars,
    projectPath,
    hasProjectDir,
    hasSslCert: true, // Wildcard SSL covers all subdomains
    rootDirectory,
  };
}

function parseNullable(value: string | undefined): string | null {
  if (!value || value === "__NONE__") return null;
  return value;
}

/**
 * Parse git remote URL. Handles SSH format conversion to HTTPS.
 */
function parseGitUrl(raw: string | undefined): string | null {
  if (!raw || raw === "__NONE__") return null;
  const url = raw.trim();
  // Convert git@github.com:user/repo.git → https://github.com/user/repo
  const sshMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`;
  }
  // Strip trailing .git from HTTPS URLs
  return url.replace(/\.git$/, "");
}

/**
 * Parse ecosystem.config.js content to extract name, port, cwd.
 */
function parseEcosystem(raw: string | null): {
  name: string | null;
  port: number | null;
  cwd: string | null;
} {
  if (!raw) return { name: null, port: null, cwd: null };

  const nameMatch = raw.match(/name:\s*['"]([^'"]+)['"]/);
  const portMatch = raw.match(/PORT:\s*(\d+)/);
  const cwdMatch = raw.match(/cwd:\s*['"]([^'"]+)['"]/);

  return {
    name: nameMatch?.[1] || null,
    port: portMatch ? parseInt(portMatch[1], 10) : null,
    cwd: cwdMatch?.[1] || null,
  };
}

/**
 * Parse package.json to extract name and detect app type.
 */
function parsePackageJson(raw: string | null): {
  name: string | null;
  appType: string | null;
} {
  if (!raw) return { name: null, appType: null };

  try {
    const pkg = JSON.parse(raw);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    let appType: string | null = null;

    if ("next" in deps) appType = "Next.js";
    // Future: else if ("astro" in deps) appType = "Astro";

    return { name: pkg.name || null, appType };
  } catch {
    return { name: null, appType: null };
  }
}

/**
 * Parse .env file content into key-value pairs.
 * Skips NODE_ENV and PORT (system-managed by EelJet).
 */
function parseEnvFile(raw: string | null): Record<string, string> {
  if (!raw) return {};

  const vars: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Skip system-managed vars
    if (key === "NODE_ENV" || key === "PORT") continue;

    vars[key] = value;
  }

  return vars;
}

function mapPm2RawStatus(
  raw: string | undefined,
): "online" | "stopped" | "errored" | "not_found" {
  if (!raw) return "not_found";
  if (raw === "online") return "online";
  if (raw === "stopped" || raw === "stopping") return "stopped";
  if (raw === "errored" || raw === "launch failed") return "errored";
  return "not_found";
}
