import {
  parseGitHubRepo,
  setRepoSecrets,
  createWorkflowFile,
} from "./cicd.github-actions";
import { createDeployScript, removeDeployScript } from "./cicd.deploy-script";
import { sshExec } from "../ssh-client";
import type { CICDSetupOptions, CICDSetupResult } from "./cicd.types";

export { removeDeployScript } from "./cicd.deploy-script";
export { detectNodeBinPath } from "./cicd.deploy-script";
export { parseGitHubRepo } from "./cicd.github-actions";
export type { CICDSetupResult } from "./cicd.types";

/**
 * Set up CI/CD for a project:
 * 1. Create deploy script on the VPS (must exist before workflow triggers)
 * 2. Set SSH secrets on the GitHub repo
 * 3. Create deploy workflow file in the repo (triggers first run)
 * 4. Sync VPS clone with remote (pulls the new workflow commit)
 *
 * Each step is independently try/caught — partial success is OK.
 */
export async function setupCICD(
  options: CICDSetupOptions,
): Promise<CICDSetupResult> {
  const { repoUrl, branch, subdomain, githubToken, vps, deployScript } =
    options;
  const errors: string[] = [];
  let secretsSet: string[] = [];
  let workflowCreated = false;
  let deployScriptCreated = false;

  const { owner, repo } = parseGitHubRepo(repoUrl);

  // Step 1: Create deploy script on VPS FIRST
  // Must exist before workflow triggers, otherwise the first run fails.
  try {
    await createDeployScript(vps, deployScript);
    deployScriptCreated = true;
  } catch (err) {
    errors.push(
      `Deploy script: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Step 2: Set GitHub Actions secrets
  try {
    const secrets: Record<string, string> = {
      SSH_HOST: vps.ssh.host,
      SSH_USER: vps.ssh.username,
      SSH_PRIVATE_KEY: vps.ssh.privateKey,
      SSH_PORT: String(vps.ssh.port),
    };

    const result = await setRepoSecrets(owner, repo, githubToken, secrets);
    secretsSet = result.set;
    errors.push(...result.errors);
  } catch (err) {
    errors.push(
      `Secrets: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Step 3: Create workflow file in the repo
  // This creates a commit which triggers the first GitHub Actions run.
  try {
    await createWorkflowFile(owner, repo, githubToken, subdomain, branch);
    workflowCreated = true;
  } catch (err) {
    errors.push(
      `Workflow: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Step 4: Sync VPS clone with remote
  // The workflow file commit needs to be pulled so local stays in sync.
  if (workflowCreated) {
    try {
      const { projectPath } = deployScript;
      await sshExec(
        vps.ssh,
        `cd "${projectPath}" && git fetch origin && git reset --hard origin/${branch}`,
      );
    } catch (err) {
      errors.push(
        `VPS sync: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    success: errors.length === 0,
    secretsSet,
    workflowCreated,
    deployScriptCreated,
    errors,
  };
}
