"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  RefreshCw,
  Rocket,
  ExternalLink,
  Trash2,
  Plus,
  Save,
  Play,
  Square,
  AlertCircle,
  Check,
  Github,
  Clock,
  ChevronDown,
  ChevronRight,
  SkipForward,
  Terminal,
} from "lucide-react";

interface EnvVar {
  id?: string;
  key: string;
  value: string;
}

interface DeploymentStep {
  id: string;
  name: string;
  command?: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  output?: string;
  error?: string;
  durationMs?: number;
}

interface Deployment {
  id: string;
  commitHash: string;
  commitMsg: string | null;
  status: "BUILDING" | "SUCCESS" | "FAILED";
  lastCompletedStep: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface Project {
  id: string;
  name: string;
  subdomain: string;
  repoUrl: string;
  branch: string;
  nodeVersion: string;
  port: number;
  rootDirectory: string | null;
  status: "PENDING" | "BUILDING" | "ACTIVE" | "FAILED" | "STOPPED";
  lastCommitHash: string | null;
  createdAt: string;
  updatedAt: string;
  deployments: Deployment[];
  envVars: { id: string; key: string }[];
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Environment variables
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loadingEnv, setLoadingEnv] = useState(false);
  const [savingEnv, setSavingEnv] = useState(false);
  const [envChanged, setEnvChanged] = useState(false);
  const [bulkEnvInput, setBulkEnvInput] = useState("");
  const [showBulkInput, setShowBulkInput] = useState(false);

  // Deployment logs
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(null);
  const [deploymentSteps, setDeploymentSteps] = useState<DeploymentStep[] | null>(null);
  const [deploymentTextLog, setDeploymentTextLog] = useState<string | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  // Resume dialog
  const [showResumeDialog, setShowResumeDialog] = useState(false);

  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN || "postomation.com";

  // Fetch project data
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to fetch project");
        }
        const data = await res.json();
        setProject(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [id]);

  // Fetch environment variables
  useEffect(() => {
    const fetchEnvVars = async () => {
      if (!project) return;
      setLoadingEnv(true);
      try {
        const res = await fetch(`/api/projects/${id}/env`);
        if (res.ok) {
          const data = await res.json();
          setEnvVars(data);
        }
      } catch {
        // Ignore errors, just show empty
      } finally {
        setLoadingEnv(false);
      }
    };
    fetchEnvVars();
  }, [id, project]);

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "" }]);
    setEnvChanged(true);
  };

  const updateEnvVar = (index: number, field: "key" | "value", value: string) => {
    const updated = [...envVars];
    updated[index][field] = value;
    setEnvVars(updated);
    setEnvChanged(true);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
    setEnvChanged(true);
  };

  const parseBulkEnv = () => {
    const lines = bulkEnvInput.split("\n");
    const parsed: EnvVar[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key) {
          parsed.push({ key, value });
        }
      }
    }

    setEnvVars([...envVars, ...parsed]);
    setBulkEnvInput("");
    setShowBulkInput(false);
    setEnvChanged(true);
  };

  const fetchDeploymentLogs = async (deploymentId: string) => {
    setLoadingLogs(true);
    setSelectedDeployment(deploymentId);
    setDeploymentSteps(null);
    setDeploymentTextLog(null);
    try {
      const res = await fetch(`/api/projects/${id}/deployments/${deploymentId}`);
      if (res.ok) {
        const data = await res.json();
        setDeploymentSteps(data.steps);
        setDeploymentTextLog(data.textLog);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingLogs(false);
    }
  };

  const toggleStepExpanded = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const getLastFailedStep = (): { stepId: string; stepName: string } | null => {
    if (!project || project.status !== "FAILED") return null;
    const lastDeployment = project.deployments.find((d) => d.status === "FAILED");
    if (!lastDeployment?.lastCompletedStep) return null;
    return {
      stepId: lastDeployment.lastCompletedStep,
      stepName: lastDeployment.lastCompletedStep,
    };
  };

  const handleDeploy = async (resumeFromStep?: string) => {
    setShowResumeDialog(false);
    setActionLoading("deploy");
    setActionResult(null);

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deploy",
          ...(resumeFromStep && { resumeFromStep }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to deploy");
      }

      setActionResult({
        type: "success",
        message: "Deployment completed successfully",
      });

      const refreshRes = await fetch(`/api/projects/${id}`);
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setProject(refreshData);
        // Auto-open logs for the latest deployment
        if (refreshData.deployments?.[0]?.id) {
          fetchDeploymentLogs(refreshData.deployments[0].id);
        }
      }
    } catch (err) {
      setActionResult({
        type: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });

      // Refresh to get latest deployment with logs
      const refreshRes = await fetch(`/api/projects/${id}`);
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setProject(refreshData);
        // Auto-open logs for the latest deployment
        if (refreshData.deployments?.[0]?.id) {
          fetchDeploymentLogs(refreshData.deployments[0].id);
        }
      }
    } finally {
      setActionLoading(null);
    }
  };

  const saveEnvVars = async () => {
    setSavingEnv(true);
    try {
      const res = await fetch(`/api/projects/${id}/env`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ envVars }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save environment variables");
      }

      setEnvChanged(false);

      if (data.vpsSynced) {
        setActionResult({
          type: "success",
          message: "Environment variables saved and synced to server. Restart to apply changes.",
        });
      } else if (data.vpsSyncError) {
        setActionResult({
          type: "error",
          message: `Saved to database but failed to sync to server: ${data.vpsSyncError}`,
        });
      } else {
        setActionResult({
          type: "success",
          message: "Environment variables saved. Deploy to apply changes.",
        });
      }
    } catch (err) {
      setActionResult({
        type: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSavingEnv(false);
    }
  };

  const handleAction = async (action: "deploy" | "restart" | "stop") => {
    setActionLoading(action);
    setActionResult(null);

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action}`);
      }

      setActionResult({
        type: "success",
        message: action === "deploy"
          ? "Deployment started successfully"
          : action === "restart"
          ? "Project restarted"
          : "Project stopped",
      });

      // Refresh project data
      const refreshRes = await fetch(`/api/projects/${id}`);
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setProject(refreshData);
      }
    } catch (err) {
      setActionResult({
        type: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    setActionLoading("delete");
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete project");
      }

      router.push("/dashboard/projects");
    } catch (err) {
      setActionResult({
        type: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: Project["status"]) => {
    switch (status) {
      case "ACTIVE":
        return <Badge className="bg-green-500">Active</Badge>;
      case "BUILDING":
        return <Badge className="bg-blue-500">Building</Badge>;
      case "FAILED":
        return <Badge variant="destructive">Failed</Badge>;
      case "STOPPED":
        return <Badge variant="secondary">Stopped</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
        <span className="text-muted-foreground">Loading project...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </Link>
        <Card className="border-destructive">
          <CardContent className="py-6">
            <p className="text-destructive">{error || "Project not found"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const projectUrl = `https://${project.subdomain}.${domain}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard/projects">
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Projects
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            {getStatusBadge(project.status)}
          </div>
          <div className="flex items-center gap-4 mt-2 text-muted-foreground">
            <a
              href={projectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              {project.subdomain}.{domain}
            </a>
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <Github className="h-4 w-4" />
              {project.repoUrl.replace("https://github.com/", "")}
            </a>
          </div>
        </div>
      </div>

      {/* Action Result */}
      {actionResult && (
        <Card className={actionResult.type === "error" ? "border-destructive" : "border-green-500"}>
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              {actionResult.type === "error" ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <Check className="h-4 w-4 text-green-500" />
              )}
              <span className={actionResult.type === "error" ? "text-destructive" : "text-green-500"}>
                {actionResult.message}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            onClick={() => {
              const failedStep = getLastFailedStep();
              if (failedStep && project.status === "FAILED") {
                setShowResumeDialog(true);
              } else {
                handleDeploy();
              }
            }}
            disabled={actionLoading !== null}
          >
            {actionLoading === "deploy" ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            Redeploy
          </Button>
          <Button
            variant="outline"
            onClick={() => handleAction("restart")}
            disabled={actionLoading !== null}
          >
            {actionLoading === "restart" ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Restart
          </Button>
          <Button
            variant="outline"
            onClick={() => handleAction("stop")}
            disabled={actionLoading !== null || project.status === "STOPPED"}
          >
            {actionLoading === "stop" ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Square className="mr-2 h-4 w-4" />
            )}
            Stop
          </Button>
          <a href={projectUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              Visit Site
            </Button>
          </a>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={actionLoading !== null}>
                {actionLoading === "delete" ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &quot;{project.name}&quot; including all deployments,
                  environment variables, and remove it from the server. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete Project
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Project Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Branch</Label>
                <p className="font-mono">{project.branch}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Node Version</Label>
                <p className="font-mono">{project.nodeVersion}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Port</Label>
                <p className="font-mono">{project.port}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Last Commit</Label>
                <p className="font-mono">{project.lastCommitHash || "N/A"}</p>
              </div>
            </div>
            {project.rootDirectory && (
              <div>
                <Label className="text-muted-foreground">Root Directory</Label>
                <p className="font-mono text-sm">{project.rootDirectory}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Deployments</CardTitle>
            <CardDescription>Click a deployment to view logs</CardDescription>
          </CardHeader>
          <CardContent>
            {project.deployments.length === 0 ? (
              <p className="text-muted-foreground text-sm">No deployments yet</p>
            ) : (
              <div className="space-y-3">
                {project.deployments.slice(0, 5).map((deployment) => (
                  <button
                    key={deployment.id}
                    type="button"
                    className="flex items-center justify-between border-b pb-2 last:border-0 w-full text-left hover:bg-muted/50 rounded px-2 py-1 -mx-2 cursor-pointer transition-colors"
                    onClick={() => fetchDeploymentLogs(deployment.id)}
                  >
                    <div className="flex items-center gap-2">
                      {deployment.status === "SUCCESS" ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : deployment.status === "FAILED" ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
                      )}
                      <div>
                        <p className="font-mono text-sm">{deployment.commitHash}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {deployment.commitMsg || "No message"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(deployment.startedAt).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Environment Variables */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Environment Variables</CardTitle>
              <CardDescription>
                Manage environment variables for your application. Changes are synced to the server automatically. Restart to apply.
              </CardDescription>
            </div>
            {envChanged && (
              <Button onClick={saveEnvVars} disabled={savingEnv}>
                {savingEnv ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Changes
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingEnv ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading environment variables...
            </div>
          ) : (
            <>
              {envVars.map((env, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="KEY"
                    value={env.key}
                    onChange={(e) => updateEnvVar(index, "key", e.target.value)}
                    className="font-mono flex-1"
                  />
                  <Input
                    placeholder="value"
                    value={env.value}
                    onChange={(e) => updateEnvVar(index, "value", e.target.value)}
                    className="flex-[2]"
                    type="password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEnvVar(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}

              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addEnvVar}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Variable
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBulkInput(!showBulkInput)}
                >
                  Paste .env
                </Button>
              </div>

              {showBulkInput && (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Paste your .env content here:&#10;DATABASE_URL=postgres://...&#10;API_KEY=secret123"
                    value={bulkEnvInput}
                    onChange={(e) => setBulkEnvInput(e.target.value)}
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={parseBulkEnv}>
                      Parse & Add
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowBulkInput(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                NODE_ENV and PORT are automatically set. Changes are synced to the server. Restart to apply new values.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Deployment Logs Dialog */}
      <Dialog open={selectedDeployment !== null} onOpenChange={(open) => { if (!open) setSelectedDeployment(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Deployment Logs
            </DialogTitle>
          </DialogHeader>
          {loadingLogs ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading logs...
            </div>
          ) : deploymentSteps ? (
            <div className="space-y-2">
              {deploymentSteps.map((step) => (
                <div key={step.id} className="border rounded-lg">
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => toggleStepExpanded(step.id)}
                  >
                    {step.status === "success" ? (
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    ) : step.status === "failed" ? (
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : step.status === "skipped" ? (
                      <SkipForward className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : step.status === "running" ? (
                      <RefreshCw className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className={`text-sm flex-1 ${step.status === "skipped" ? "text-muted-foreground" : ""}`}>
                      {step.name}
                    </span>
                    {step.durationMs != null && (
                      <span className="text-xs text-muted-foreground">
                        {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
                      </span>
                    )}
                    {(step.output || step.error || step.command) ? (
                      expandedSteps.has(step.id) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )
                    ) : null}
                  </button>
                  {expandedSteps.has(step.id) && (
                    <div className="px-3 pb-2 space-y-1 border-t">
                      {step.command && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">Command:</p>
                          <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">{step.command}</pre>
                        </div>
                      )}
                      {step.output && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Output:</p>
                          <pre className="text-xs font-mono bg-muted p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">{step.output}</pre>
                        </div>
                      )}
                      {step.error && (
                        <div>
                          <p className="text-xs text-destructive mb-1">Error:</p>
                          <pre className="text-xs font-mono bg-destructive/10 text-destructive p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">{step.error}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : deploymentTextLog ? (
            <pre className="text-xs font-mono bg-muted p-3 rounded max-h-96 overflow-auto whitespace-pre-wrap">
              {deploymentTextLog}
            </pre>
          ) : (
            <p className="text-muted-foreground text-sm">No logs available</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Resume Deploy Dialog */}
      <Dialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeploy Project</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The last deployment failed. How would you like to proceed?
          </p>
          <div className="flex flex-col gap-2 mt-4">
            <Button onClick={() => handleDeploy()} className="w-full">
              <Rocket className="mr-2 h-4 w-4" />
              Deploy Fresh
            </Button>
            {getLastFailedStep() && (
              <Button
                variant="outline"
                onClick={() => handleDeploy(getLastFailedStep()!.stepId)}
                className="w-full"
              >
                <Play className="mr-2 h-4 w-4" />
                Resume from failed step
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
