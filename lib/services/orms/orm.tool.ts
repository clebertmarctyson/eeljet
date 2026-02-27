import type { SSHConfig } from "../ssh-client";

export interface OrmTool {
  name: string;
  detect(ssh: SSHConfig, workDir: string): Promise<boolean>;
  generate(ssh: SSHConfig, workDir: string, sourceNvm: string): Promise<void>;
  pushSchema(
    ssh: SSHConfig,
    workDir: string,
    sourceNvm: string,
    envVars: Record<string, string>,
  ): Promise<{ ran: boolean; message: string }>;
}
