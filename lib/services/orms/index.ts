import type { OrmTool } from "./orm.tool";
import type { SSHConfig } from "../ssh-client";
import { PrismaOrm } from "./orm.prisma";

export type { OrmTool } from "./orm.tool";

const ORM_TOOLS: OrmTool[] = [
  new PrismaOrm(),
  // Future: new DrizzleOrm(),
  // Future: new TypeOrmProvider(),
];

export async function detectOrm(
  ssh: SSHConfig,
  workDir: string,
): Promise<OrmTool | null> {
  for (const orm of ORM_TOOLS) {
    if (await orm.detect(ssh, workDir)) {
      return orm;
    }
  }
  return null;
}
