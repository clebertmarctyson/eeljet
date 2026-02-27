import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  updated_at: string;
  language: string | null;
}

/**
 * GET /api/github/repos
 * Returns the user's GitHub repositories
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get user with encrypted GitHub token
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { encryptedGithubToken: true },
    });

    if (!user?.encryptedGithubToken) {
      return NextResponse.json(
        { error: "GitHub token not found. Please sign out and sign in again with GitHub." },
        { status: 400 }
      );
    }

    // Decrypt token
    const githubToken = decrypt(user.encryptedGithubToken);

    // Fetch repos from GitHub API
    const response = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=100&type=all",
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("GitHub API error:", error);
      return NextResponse.json(
        { error: "Failed to fetch repositories from GitHub" },
        { status: response.status }
      );
    }

    const repos: GitHubRepo[] = await response.json();

    // Return simplified repo data
    const simplifiedRepos = repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      url: repo.html_url,
      description: repo.description,
      isPrivate: repo.private,
      defaultBranch: repo.default_branch,
      updatedAt: repo.updated_at,
      language: repo.language,
    }));

    return NextResponse.json(simplifiedRepos);
  } catch (error) {
    console.error("Error fetching repos:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
