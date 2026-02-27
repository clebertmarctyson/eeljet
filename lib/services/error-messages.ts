/**
 * Maps raw technical error messages to user-friendly messages.
 * Used at the API boundary before sending errors to the client.
 */

const ERROR_PATTERNS: [RegExp, string][] = [
  // Git / Clone errors
  [/Clone failed/i, "Failed to clone the repository. Please check the repo URL and make sure EelJet has access."],
  [/Git pull failed/i, "Failed to pull the latest code. Please check that the branch exists and the repo is accessible."],
  [/Failed to get commit/i, "Could not read the latest commit. The repository may be empty or corrupted."],
  [/Repository not found/i, "Repository not found. Please check the URL and your GitHub permissions."],
  [/Authentication failed/i, "GitHub authentication failed. Please reconnect your GitHub account."],
  [/Invalid branch name/i, "Invalid branch name. Use only letters, numbers, slashes, dots, and hyphens."],

  // Port errors
  [/Port (\d+) is already in use/i, "Port $1 is already in use. Please choose a different port or let EelJet assign one automatically."],
  [/Port must be between/i, "Invalid port number. Port must be between 3001 and 65535."],
  [/Port is reserved/i, "This port is reserved for system services. Please choose a different one."],
  [/Port must be an integer/i, "Port must be a valid number."],
  [/No available ports/i, "No available ports. Please contact the administrator."],

  // Subdomain errors
  [/Subdomain is already taken/i, "This subdomain is already in use. Please choose a different one."],
  [/Invalid subdomain format/i, "Invalid subdomain. Use only lowercase letters, numbers, and hyphens."],
  [/Subdomain must be 3-63/i, "Subdomain must be between 3 and 63 characters."],
  [/This subdomain is reserved/i, "This subdomain is reserved and cannot be used."],

  // Build / Install errors
  [/npm install failed/i, "Failed to install dependencies with npm. Check your package.json for errors."],
  [/pnpm install failed/i, "Failed to install dependencies with pnpm. Check your package.json for errors."],
  [/yarn install failed/i, "Failed to install dependencies with yarn. Check your package.json for errors."],
  [/Build failed/i, "Build failed. Check your build configuration and logs for details."],
  [/Failed to write \.env/i, "Failed to configure environment variables on the server."],
  [/\.env file missing/i, "Environment file could not be created. Please try again."],

  // PM2 errors
  [/Application failed to start/i, "The application failed to start. Check your start command and logs."],
  [/Port \d+ not bound/i, "The application started but isn't responding. Check your app's PORT configuration."],
  [/PM2 stop failed/i, "Failed to stop the application. It may have already been stopped."],
  [/PM2 restart failed/i, "Failed to restart the application. Try stopping and redeploying."],
  [/PM2 process .+ still running/i, "Could not fully stop the application. Please try again."],

  // Nginx errors
  [/Nginx config test failed/i, "Server configuration error. The deployment was rolled back safely."],
  [/Failed to reload Nginx/i, "Could not apply server configuration changes. Please contact the administrator."],
  [/Failed to add port mapping/i, "Could not configure the subdomain routing. Please try again."],

  // Root directory
  [/Root directory .+ does not exist/i, "The specified root directory was not found in the repository."],

  // Auth errors
  [/GitHub token not found/i, "GitHub connection expired. Please sign out and sign back in."],
  [/Could not verify GitHub/i, "Could not verify your GitHub account. Please sign out and sign back in."],
  [/Unauthorized/i, "You need to sign in to perform this action."],
  [/Project not found/i, "Project not found. It may have been deleted."],

  // Env var errors
  [/Invalid environment variable key/i, "Invalid environment variable name. Use uppercase letters, numbers, and underscores only (e.g. MY_VAR)."],
  [/Cannot override system variable/i, "This environment variable name is reserved by the system."],

  // SSH / VPS connection errors
  [/ECONNREFUSED/i, "Cannot connect to the server. Please try again later."],
  [/ETIMEDOUT/i, "Server connection timed out. Please try again."],
  [/ENOTFOUND/i, "Server not found. Please contact the administrator."],
  [/ssh.*timeout/i, "Server connection timed out. Please try again."],
  [/sudo.*terminal.*password/i, "Server permission error. Please contact the administrator."],

  // Deletion errors
  [/still exists after rm/i, "Could not fully remove the project files. Please contact the administrator."],
  [/Deletion failed/i, "Some cleanup steps failed. Please check the details and try again."],
];

/**
 * Convert a raw error message to a user-friendly message.
 * Falls back to a generic message if no pattern matches.
 */
export function toUserError(raw: string): string {
  for (const [pattern, friendly] of ERROR_PATTERNS) {
    if (pattern.test(raw)) {
      return raw.replace(pattern, friendly);
    }
  }

  // Generic fallback — hide technical details
  if (raw.includes("stderr") || raw.includes("exit code") || raw.includes("ECONNR")) {
    return "An unexpected error occurred. Please try again or contact the administrator.";
  }

  return raw;
}

/**
 * Sanitize a DeployResult error before sending to the client.
 * Preserves logs for the expandable details section.
 */
export function sanitizeDeployError(result: {
  success: boolean;
  error?: string;
  logs?: string;
  [key: string]: unknown;
}): typeof result {
  if (result.success || !result.error) return result;
  return {
    ...result,
    error: toUserError(result.error),
  };
}
