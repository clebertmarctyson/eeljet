import sodium from "libsodium-wrappers";

const GITHUB_API = "https://api.github.com";

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

/**
 * Parse a GitHub repo URL into owner and repo.
 * e.g. "https://github.com/user/repo" → { owner: "user", repo: "repo" }
 */
export function parseGitHubRepo(repoUrl: string): {
  owner: string;
  repo: string;
} {
  const url = new URL(repoUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`Invalid GitHub repo URL: ${repoUrl}`);
  }
  return {
    owner: parts[0],
    repo: parts[1].replace(/\.git$/, ""),
  };
}

/**
 * Encrypt a secret value using the repo's public key (libsodium sealed box).
 */
async function encryptSecret(
  value: string,
  publicKeyBase64: string,
): Promise<string> {
  await sodium.ready;
  const publicKey = sodium.from_base64(
    publicKeyBase64,
    sodium.base64_variants.ORIGINAL,
  );
  const messageBytes = sodium.from_string(value);
  const encrypted = sodium.crypto_box_seal(messageBytes, publicKey);
  return sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
}

/**
 * Get the repo's Actions public key (needed to encrypt secrets).
 */
async function getRepoPublicKey(
  owner: string,
  repo: string,
  token: string,
): Promise<{ key_id: string; key: string }> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/public-key`,
    { headers: headers(token) },
  );
  if (!res.ok) {
    throw new Error(
      `Failed to get repo public key: ${res.status} ${await res.text()}`,
    );
  }
  return res.json();
}

/**
 * Set GitHub Actions secrets on a repo.
 * Returns the list of secret names that were successfully set.
 */
export async function setRepoSecrets(
  owner: string,
  repo: string,
  token: string,
  secrets: Record<string, string>,
): Promise<{ set: string[]; errors: string[] }> {
  const { key_id, key } = await getRepoPublicKey(owner, repo, token);
  const set: string[] = [];
  const errors: string[] = [];

  for (const [name, value] of Object.entries(secrets)) {
    try {
      const encryptedValue = await encryptSecret(value, key);
      const res = await fetch(
        `${GITHUB_API}/repos/${owner}/${repo}/actions/secrets/${name}`,
        {
          method: "PUT",
          headers: headers(token),
          body: JSON.stringify({ encrypted_value: encryptedValue, key_id }),
        },
      );
      if (!res.ok) {
        errors.push(`Secret ${name}: ${res.status} ${await res.text()}`);
      } else {
        set.push(name);
      }
    } catch (err) {
      errors.push(
        `Secret ${name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { set, errors };
}

/**
 * Create or update the deploy workflow file in the repo.
 */
export async function createWorkflowFile(
  owner: string,
  repo: string,
  token: string,
  subdomain: string,
  branch: string,
): Promise<void> {
  const workflowContent = `name: Deploy via EelJet

on:
  push:
    branches:
      - ${branch}

jobs:
  deploy:
    name: Deploy Application
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: \${{ secrets.SSH_HOST }}
          username: \${{ secrets.SSH_USER }}
          key: \${{ secrets.SSH_PRIVATE_KEY }}
          port: \${{ secrets.SSH_PORT }}
          script: ~/${subdomain}_deploy.sh
`;

  const contentBase64 = Buffer.from(workflowContent).toString("base64");
  const path = ".github/workflows/eeljet-deploy.yml";

  // Check if file already exists (need SHA to update)
  let sha: string | undefined;
  const checkRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    { headers: headers(token) },
  );
  if (checkRes.ok) {
    const existing = await checkRes.json();
    sha = existing.sha;
  }

  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`,
    {
      method: "PUT",
      headers: headers(token),
      body: JSON.stringify({
        message: "Add EelJet deploy workflow",
        content: contentBase64,
        branch,
        ...(sha ? { sha } : {}),
      }),
    },
  );

  if (!res.ok) {
    throw new Error(
      `Failed to create workflow file: ${res.status} ${await res.text()}`,
    );
  }
}
