import type { GitProvider, CloneResult } from "./git.provider";
import { sshExec, type SSHConfig } from "../ssh-client";

export class GitHubProvider implements GitProvider {
  name = "GitHub";

  canHandle(repoUrl: string): boolean {
    try {
      const parsed = new URL(repoUrl);
      return parsed.hostname === "github.com";
    } catch {
      return false;
    }
  }

  validateRepoUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "github.com") {
        throw new Error("Only GitHub repositories are supported");
      }
      if (!/^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(parsed.pathname)) {
        throw new Error("Invalid GitHub repository URL");
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("GitHub")) {
        throw e;
      }
      throw new Error("Invalid repository URL");
    }
  }

  async cloneSecure(
    ssh: SSHConfig,
    repoUrl: string,
    branch: string,
    token: string,
    destPath: string,
  ): Promise<CloneResult> {
    const credHelperPath = `/tmp/git-cred-${Date.now()}-${Math.random().toString(36).substring(7)}.sh`;

    try {
      const credHelperContent = `#!/bin/sh\necho "${token}"`;
      await sshExec(
        ssh,
        `cat > "${credHelperPath}" << 'EELJET_CRED_EOF'\n${credHelperContent}\nEELJET_CRED_EOF`,
      );

      await sshExec(ssh, `chmod 700 "${credHelperPath}"`);

      const cloneResult = await sshExec(
        ssh,
        `GIT_ASKPASS="${credHelperPath}" GIT_TERMINAL_PROMPT=0 git clone --branch "${branch}" --single-branch --depth 1 "${repoUrl}" "${destPath}" 2>&1`,
      );

      if (cloneResult.code !== 0) {
        return {
          success: false,
          error: `Git clone failed: ${cloneResult.stderr || cloneResult.stdout}`,
        };
      }

      return { success: true };
    } finally {
      await sshExec(ssh, `rm -f "${credHelperPath}" 2>/dev/null || true`);
    }
  }

  async setupCredentials(
    ssh: SSHConfig,
    projectPath: string,
    token: string,
  ): Promise<string> {
    const credHelperPath = `/tmp/git-cred-${Date.now()}-${Math.random().toString(36).substring(7)}.sh`;

    const credHelperContent = `#!/bin/sh\necho "${token}"`;
    await sshExec(
      ssh,
      `cat > "${credHelperPath}" << 'EELJET_CRED_EOF'\n${credHelperContent}\nEELJET_CRED_EOF`,
    );
    await sshExec(ssh, `chmod 700 "${credHelperPath}"`);

    await sshExec(
      ssh,
      `cd "${projectPath}" && git config credential.helper "!f() { cat ${credHelperPath}; }; f"`,
    );

    return credHelperPath;
  }

  async cleanupCredentials(
    ssh: SSHConfig,
    credHelperPath: string,
  ): Promise<void> {
    await sshExec(ssh, `rm -f "${credHelperPath}" 2>/dev/null || true`);
  }
}
