"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  RefreshCw,
  FolderOpen,
  ExternalLink,
  Trash2,
  GitBranch,
  Play,
  Square,
  RotateCcw,
  Download,
  X,
  Check,
  Circle,
  AlertCircle,
} from "lucide-react";

interface Deployment {
  id: string;
  commitHash: string;
  commitMsg: string | null;
  status: "BUILDING" | "SUCCESS" | "FAILED";
  startedAt: string;
}

interface SyncResult {
  success: boolean;
  discovered: number;
  imported: { subdomain: string; success: boolean; error?: string }[];
  reconciled: { subdomain: string; statusUpdated: boolean; oldStatus: string; newStatus: string }[];
  orphaned: { id: string; subdomain: string; name: string }[];
  alreadyInSync: number;
  errors: string[];
}

interface SyncProgress {
  stage: "discovering" | "discovered" | "importing" | "imported" | "reconciling" | "complete";
  message: string;
  current?: number;
  total?: number;
  subdomains?: string[];
  completedItems?: { subdomain: string; success: boolean; error?: string }[];
}

interface Project {
  id: string;
  name: string;
  subdomain: string;
  repoUrl: string;
  branch: string;
  port: number;
  status: "PENDING" | "BUILDING" | "ACTIVE" | "FAILED" | "STOPPED";
  lastCommitHash: string | null;
  createdAt: string;
  deployments: Deployment[];
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [userPlan, setUserPlan] = useState<string>("FREE");
  const [userRole, setUserRole] = useState<string>("USER");

  // Get domain from env (passed via API or hardcoded for now)
  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN || "postomation.com";

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      setProjects(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const performAction = async (projectId: string, action: "deploy" | "restart" | "stop") => {
    setActionLoading(`${projectId}-${action}`);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} project`);
      }

      setSuccess(`Project ${action} initiated successfully`);
      await fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActionLoading(null);
    }
  };

  const deleteProject = async (id: string) => {
    if (!confirm("Are you sure you want to delete this project? This will remove all resources.")) {
      return;
    }

    setActionLoading(`${id}-delete`);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete project");
      }
      setSuccess("Project deleted successfully");
      await fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActionLoading(null);
    }
  };

  const syncFromVPS = async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    setSyncResult(null);
    setSyncProgress({ stage: "discovering", message: "Connecting to VPS..." });

    const completed: { subdomain: string; success: boolean; error?: string }[] = [];

    try {
      const res = await fetch("/api/sync", { method: "POST" });

      if (!res.ok && res.status !== 401) {
        throw new Error("Sync failed");
      }
      if (res.status === 401) {
        throw new Error("Unauthorized");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const data = line.replace(/^data: /, "").trim();
          if (!data) continue;

          try {
            const event = JSON.parse(data);

            switch (event.type) {
              case "discovering":
                setSyncProgress({ stage: "discovering", message: "Scanning VPS for projects..." });
                break;

              case "discovered":
                setSyncProgress({
                  stage: "discovered",
                  message: `Found ${event.total} project${event.total !== 1 ? "s" : ""} on VPS`,
                  total: event.total,
                  subdomains: event.subdomains,
                });
                break;

              case "importing":
                setSyncProgress({
                  stage: "importing",
                  message: `Importing ${event.subdomain}...`,
                  current: event.current,
                  total: event.total,
                  completedItems: [...completed],
                });
                break;

              case "imported":
                completed.push({
                  subdomain: event.subdomain,
                  success: event.success,
                  error: event.error,
                });
                setSyncProgress({
                  stage: "imported",
                  message: event.success
                    ? `Imported ${event.subdomain}`
                    : `Failed to import ${event.subdomain}`,
                  current: event.current,
                  total: event.total,
                  completedItems: [...completed],
                });
                if (event.success) {
                  fetchProjects();
                }
                break;

              case "reconciling":
                setSyncProgress({
                  stage: "reconciling",
                  message: "Reconciling statuses...",
                  completedItems: [...completed],
                });
                break;

              case "complete":
                setSyncResult(event.result);
                setSyncProgress(null);
                await fetchProjects();
                break;
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
      setSyncProgress(null);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.user?.plan) setUserPlan(data.user.plan);
        if (data?.user?.role) setUserRole(data.user.role);
      })
      .catch(() => {});
  }, []);

  const PLAN_LIMITS: Record<string, number> = { FREE: 5, PRO: 15 };
  const projectLimit =
    userRole === "ADMIN" ? null : (PLAN_LIMITS[userPlan] ?? 5);
  const atLimit = projectLimit !== null && projects.length >= projectLimit;
  const nearLimit =
    projectLimit !== null && !atLimit && projects.length >= projectLimit - 1;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getRepoName = (repoUrl: string) => {
    return repoUrl.replace("https://github.com/", "").replace(".git", "");
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground">
            Deploy and manage your applications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={syncFromVPS}
            disabled={syncing}
          >
            {syncing ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {syncing && syncProgress?.current && syncProgress?.total
              ? `Syncing ${syncProgress.current}/${syncProgress.total}...`
              : syncing
              ? "Syncing..."
              : "Sync from VPS"}
          </Button>
          <Link href={atLimit ? "#" : "/dashboard/projects/new"}>
            <Button
              disabled={atLimit}
              title={
                atLimit ? `${userPlan} plan limit reached` : undefined
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </Link>
        </div>
      </div>

      {success && (
        <Card className="border-green-500">
          <CardContent className="py-4">
            <p className="text-green-600">{success}</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {atLimit && (
        <Card className="border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex items-center gap-2 py-4">
            <AlertCircle className="h-4 w-4 shrink-0 text-yellow-600" />
            <p className="text-sm text-yellow-600">
              You&apos;ve reached the {userPlan} plan limit of {projectLimit}{" "}
              projects.{" "}
              <span className="font-medium cursor-pointer hover:underline">
                Upgrade your plan
              </span>{" "}
              to create more.
            </p>
          </CardContent>
        </Card>
      )}

      {nearLimit && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="flex items-center gap-2 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-yellow-500" />
            <p className="text-sm text-muted-foreground">
              You&apos;re using {projects.length} of {projectLimit} projects on
              the {userPlan} plan.
            </p>
          </CardContent>
        </Card>
      )}

      {syncProgress && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
              <h3 className="font-semibold text-sm">{syncProgress.message}</h3>
            </div>

            {syncProgress.total && syncProgress.total > 0 && (
              <>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${((syncProgress.completedItems?.length || 0) / syncProgress.total) * 100}%`,
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  {syncProgress.subdomains?.map((sub) => {
                    const item = syncProgress.completedItems?.find((c) => c.subdomain === sub);
                    const isActive =
                      syncProgress.stage === "importing" &&
                      !item &&
                      syncProgress.completedItems?.length === syncProgress.subdomains!.indexOf(sub);

                    return (
                      <div key={sub} className="flex items-center gap-2 text-sm">
                        {item ? (
                          item.success ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                          )
                        ) : isActive ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
                        )}
                        <span
                          className={
                            item
                              ? item.success
                                ? "text-foreground"
                                : "text-destructive"
                              : isActive
                              ? "text-foreground"
                              : "text-muted-foreground/60"
                          }
                        >
                          {sub}
                        </span>
                        {item && !item.success && item.error && (
                          <span className="text-xs text-destructive">({item.error})</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {syncResult && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Sync Results</h3>
              <Button variant="ghost" size="sm" onClick={() => setSyncResult(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-sm space-y-1">
              <p>Discovered on VPS: {syncResult.discovered}</p>
              {syncResult.imported.length > 0 && (
                <p>Imported: {syncResult.imported.filter((i) => i.success).length} project(s)</p>
              )}
              {syncResult.reconciled.filter((r) => r.statusUpdated).length > 0 && (
                <p>
                  Status updated: {syncResult.reconciled
                    .filter((r) => r.statusUpdated)
                    .map((r) => `${r.subdomain} (${r.oldStatus} -> ${r.newStatus})`)
                    .join(", ")}
                </p>
              )}
              {syncResult.alreadyInSync > 0 && (
                <p className="text-muted-foreground">Already in sync: {syncResult.alreadyInSync}</p>
              )}
              {syncResult.orphaned.length > 0 && (
                <p className="text-yellow-600">
                  In DB but not on VPS: {syncResult.orphaned.map((o) => o.subdomain).join(", ")}
                </p>
              )}
              {syncResult.imported.filter((i) => !i.success).length > 0 && (
                <p className="text-destructive">
                  Failed: {syncResult.imported
                    .filter((i) => !i.success)
                    .map((i) => `${i.subdomain}: ${i.error}`)
                    .join("; ")}
                </p>
              )}
              {syncResult.errors.length > 0 && (
                <details className="text-muted-foreground">
                  <summary className="cursor-pointer hover:underline text-xs">
                    {syncResult.errors.length} warning(s)
                  </summary>
                  <ul className="mt-1 text-xs space-y-0.5">
                    {syncResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
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
        <div className="space-y-3">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
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
                            : project.status === "STOPPED"
                            ? "outline"
                            : project.status === "PENDING"
                            ? "outline"
                            : "destructive"
                        }
                      >
                        {project.status.toLowerCase()}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="font-mono">
                        {project.subdomain}.{domain}
                      </span>
                      <span className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {getRepoName(project.repoUrl)}:{project.branch}
                      </span>
                      {project.lastCommitHash && (
                        <span className="font-mono text-xs">
                          @ {project.lastCommitHash}
                        </span>
                      )}
                      <span>Created: {formatDate(project.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    {project.status === "ACTIVE" && (
                      <>
                        <a
                          href={`https://${project.subdomain}.${domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="ghost" size="sm" title="Open site">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Restart"
                          onClick={() => performAction(project.id, "restart")}
                          disabled={actionLoading === `${project.id}-restart`}
                        >
                          {actionLoading === `${project.id}-restart` ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Stop"
                          onClick={() => performAction(project.id, "stop")}
                          disabled={actionLoading === `${project.id}-stop`}
                        >
                          {actionLoading === `${project.id}-stop` ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </Button>
                      </>
                    )}
                    {(project.status === "STOPPED" || project.status === "FAILED" || project.status === "PENDING") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Deploy"
                        onClick={() => performAction(project.id, "deploy")}
                        disabled={actionLoading === `${project.id}-deploy`}
                      >
                        {actionLoading === `${project.id}-deploy` ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Delete"
                      onClick={() => deleteProject(project.id)}
                      disabled={actionLoading === `${project.id}-delete`}
                    >
                      {actionLoading === `${project.id}-delete` ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
