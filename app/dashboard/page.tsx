import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { FolderOpen, Plus, ExternalLink, Rocket, GitBranch } from "lucide-react";
import { getAppDomain } from "@/lib/config";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Overview of your deployed projects. Manage your apps from one central dashboard.",
  openGraph: {
    title: "Dashboard | EelJet",
    description:
      "Overview of your deployed projects. Manage your apps from one central dashboard.",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dashboard | EelJet",
    description:
      "Overview of your deployed projects. Manage your apps from one central dashboard.",
    images: ["/twitter-image.png"],
  },
};

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/");
  }

  const domain = getAppDomain();

  const [projects, totalProjects] = await Promise.all([
    prisma.project.findMany({
      where: { userId: session.user.id },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        deployments: {
          orderBy: { startedAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.project.count({ where: { userId: session.user.id } }),
  ]);

  const activeProjects = projects.filter((p) => p.status === "ACTIVE").length;

  const PLAN_LIMITS: Record<string, number> = { FREE: 5, PRO: 15 };
  const projectLimit =
    session.user.role === "ADMIN"
      ? null
      : (PLAN_LIMITS[session.user.plan] ?? 5);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Deploy and manage your applications
          </p>
        </div>
        <Link href="/dashboard/projects/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <Rocket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeProjects}</div>
            <p className="text-xs text-muted-foreground">Currently running</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {session.user.plan} Plan
            </CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalProjects}
              {projectLimit !== null && (
                <span className="text-muted-foreground font-normal text-lg">
                  {" "}
                  / {projectLimit}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <Link
                href="/dashboard/projects"
                className="text-xs text-muted-foreground hover:underline"
              >
                {projectLimit !== null ? "projects used" : "Unlimited (Admin)"}
              </Link>
              {session.user.plan === "FREE" && (
                <span className="text-xs text-primary cursor-pointer hover:underline">
                  Upgrade
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Domain</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold truncate">{domain}</div>
            <p className="text-xs text-muted-foreground">
              Your apps: *.{domain}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Projects</h2>
          <Link href="/dashboard/projects">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-10">
              <FolderOpen className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No projects yet</p>
              <Link href="/dashboard/projects/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Deploy your first project
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <Card key={project.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/projects/${project.id}`}
                        className="font-medium hover:underline"
                      >
                        {project.name}
                      </Link>
                      <Badge
                        variant={
                          project.status === "ACTIVE"
                            ? "default"
                            : project.status === "BUILDING"
                            ? "secondary"
                            : project.status === "PENDING"
                            ? "outline"
                            : "destructive"
                        }
                      >
                        {project.status.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {project.subdomain}.{domain}
                      {project.lastCommitHash && (
                        <span className="ml-2 font-mono text-xs">
                          @ {project.lastCommitHash}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/dashboard/projects/${project.id}`}>
                      <Button variant="ghost" size="sm">
                        Manage
                      </Button>
                    </Link>
                    {project.status === "ACTIVE" && (
                      <a
                        href={`https://${project.subdomain}.${domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
