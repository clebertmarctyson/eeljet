import type { GitProvider } from "./git.provider";
import { GitHubProvider } from "./git.github";

export type { GitProvider, CloneResult } from "./git.provider";

const GIT_PROVIDERS: GitProvider[] = [
  new GitHubProvider(),
  // Future: new GitLabProvider(),
  // Future: new BitbucketProvider(),
];

export function detectGitProvider(repoUrl: string): GitProvider {
  for (const provider of GIT_PROVIDERS) {
    if (provider.canHandle(repoUrl)) {
      return provider;
    }
  }
  throw new Error(
    "Unsupported git provider. Currently only GitHub is supported.",
  );
}
