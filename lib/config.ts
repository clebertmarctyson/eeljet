import type { VPSConfig } from "./services/nginx-manager";

/**
 * Get VPS configuration from environment variables
 * This is admin-level config, not per-user
 */
export function getVPSConfig(): VPSConfig {
  const host = process.env.VPS_HOST;
  const port = parseInt(process.env.VPS_PORT || "22", 10);
  const username = process.env.VPS_USER;
  const privateKey = process.env.VPS_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!host) throw new Error("VPS_HOST environment variable is not set");
  if (!username) throw new Error("VPS_USER environment variable is not set");
  if (!privateKey)
    throw new Error("VPS_PRIVATE_KEY environment variable is not set");

  return {
    ssh: {
      host,
      port,
      username,
      privateKey,
    },
    projectsRoot: process.env.PROJECTS_ROOT || "/var/www",
    deployUser: process.env.VPS_USER || "root",
    portMappingFile:
      process.env.PORT_MAPPING_FILE || "/etc/nginx/subdomain-ports.map",
    markersDir:
      process.env.MARKERS_DIR || "/var/lib/eeljet/markers",
  };
}

/**
 * Get the app domain for deployed projects
 */
export function getAppDomain(): string {
  const domain = process.env.APP_DOMAIN;
  if (!domain) throw new Error("APP_DOMAIN environment variable is not set");
  return domain;
}

/**
 * Get the storage root path
 */
export function getStorageRoot(): string {
  return process.env.STORAGE_ROOT || "/var/www/storage";
}
