import type { OrmTool } from "./orm.tool";
import { sshExec, type SSHConfig } from "../ssh-client";

export class PrismaOrm implements OrmTool {
  name = "Prisma";

  async detect(ssh: SSHConfig, workDir: string): Promise<boolean> {
    // Check for prisma/ directory
    const prismaDir = await sshExec(
      ssh,
      `test -d "${workDir}/prisma" && echo "exists" || true`,
    );
    if (prismaDir.stdout.includes("exists")) {
      return true;
    }

    // Check package.json for prisma dependency
    const pkgJson = await sshExec(
      ssh,
      `cat "${workDir}/package.json" 2>/dev/null || echo "{}"`,
    );
    try {
      const pkg = JSON.parse(pkgJson.stdout);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      return "prisma" in deps || "@prisma/client" in deps;
    } catch {
      return false;
    }
  }

  async generate(
    ssh: SSHConfig,
    workDir: string,
    sourceNvm: string,
  ): Promise<void> {
    const result = await sshExec(
      ssh,
      `bash -c '${sourceNvm} && cd "${workDir}" && npx prisma generate 2>&1'`,
      { timeout: 120000 },
    );
    if (result.code !== 0) {
      throw new Error(
        `Prisma generate failed:\n${result.stderr || result.stdout}`,
      );
    }
  }

  async pushSchema(
    ssh: SSHConfig,
    workDir: string,
    sourceNvm: string,
    envVars: Record<string, string>,
  ): Promise<{ ran: boolean; message: string }> {
    if (!envVars.DATABASE_URL) {
      return { ran: false, message: "Generated (no DATABASE_URL)" };
    }

    const result = await sshExec(
      ssh,
      `bash -c '${sourceNvm} && cd "${workDir}" && npx prisma db push 2>&1'`,
      { timeout: 120000 },
    );

    if (result.code !== 0) {
      return {
        ran: true,
        message: `Generated (db push warning: ${result.stderr || result.stdout})`,
      };
    }

    return { ran: true, message: "Generated and database pushed" };
  }
}
