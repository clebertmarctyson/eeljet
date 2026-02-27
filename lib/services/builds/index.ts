import type { AppTypeDetector } from "./build.pack";
import { NextJsApp } from "./build.nextjs";
import type { VPSConfig } from "../nginx-manager";

export type { AppTypeDetector } from "./build.pack";

const APP_TYPES: AppTypeDetector[] = [
  new NextJsApp(),
  // Future: new AstroApp(),
  // Future: new RemixApp(),
];

export async function detectAppType(
  workDir: string,
  vps: VPSConfig,
): Promise<AppTypeDetector> {
  for (const appType of APP_TYPES) {
    if (await appType.detect(workDir, vps)) {
      return appType;
    }
  }
  throw new Error("Unsupported app type. Currently only Next.js is supported.");
}
