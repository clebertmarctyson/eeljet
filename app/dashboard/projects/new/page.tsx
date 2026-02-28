"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  RefreshCw,
  Rocket,
  Github,
  Lock,
  Globe,
  Plus,
  Trash2,
  AlertCircle,
  Save,
  Eye,
  EyeOff,
  Settings2,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  isPrivate: boolean;
  defaultBranch: string;
  updatedAt: string;
  language: string | null;
}

interface EnvVar {
  key: string;
  value: string;
  showValue?: boolean; // For toggling visibility
}

interface SavedFormState {
  selectedRepoId: string;
  name: string;
  subdomain: string;
  branch: string;
  rootDirectory: string;
  envVars: EnvVar[];
  savedAt: number;
}

const STORAGE_KEY = "eeljet_new_project_draft";
const DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

// SECURITY: Client-side validation functions
const validateSubdomain = (subdomain: string): string | null => {
  if (subdomain.length < 3 || subdomain.length > 63) {
    return "Subdomain must be 3-63 characters long";
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    return "Subdomain can only contain lowercase letters, numbers, and hyphens (not at start/end)";
  }
  const reserved = [
    "www",
    "api",
    "admin",
    "mail",
    "ftp",
    "ssh",
    "app",
    "dashboard",
  ];
  if (reserved.includes(subdomain)) {
    return "This subdomain is reserved";
  }
  return null;
};

const validateEnvKey = (key: string): string | null => {
  if (!key) return "Environment variable key cannot be empty";
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    return "Environment variable must be uppercase, start with letter or underscore, and contain only letters, numbers, and underscores";
  }
  const protected_vars = ["PATH", "HOME", "USER", "SHELL"];
  if (protected_vars.includes(key)) {
    return `Cannot override system variable: ${key}`;
  }
  return null;
};

const validateBranchName = (branch: string): string | null => {
  if (!branch) return null; // Empty is OK (will use default)
  if (!/^[a-zA-Z0-9/_.-]+$/.test(branch)) {
    return "Branch name contains invalid characters";
  }
  if (branch.startsWith("-") || branch.endsWith(".lock")) {
    return "Invalid branch name format";
  }
  return null;
};

export default function NewProjectPage() {
  const router = useRouter();
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployLogs, setDeployLogs] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<{ id: string; name: string; status: string; error?: string; durationMs?: number }[] | null>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // SECURITY: Add validation errors state
  const [validationErrors, setValidationErrors] = useState<{
    subdomain?: string;
    branch?: string;
    envVars?: { [index: number]: string | undefined };
  }>({});

  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [branch, setBranch] = useState("");
  const [rootDirectory, setRootDirectory] = useState("");
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [installCommand, setInstallCommand] = useState("");
  const [buildCommand, setBuildCommand] = useState("");
  const [startCommand, setStartCommand] = useState("");
  const [bulkEnvInput, setBulkEnvInput] = useState("");
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [checkingSubdomain, setCheckingSubdomain] = useState(false);
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(
    null,
  );
  const [suggestedSubdomain, setSuggestedSubdomain] = useState<string | null>(
    null,
  );
  const checkSubdomainTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const domain = process.env.NEXT_PUBLIC_APP_DOMAIN as string;

  const selectedRepo = repos.find((r) => r.id.toString() === selectedRepoId);
  const fullDomain = subdomain ? `${subdomain}.${domain}` : "";

  // Check subdomain availability against the database
  const checkSubdomainAvailability = useCallback((value: string) => {
    if (checkSubdomainTimer.current) {
      clearTimeout(checkSubdomainTimer.current);
    }

    const error = validateSubdomain(value);
    if (error || !value) {
      setSubdomainAvailable(null);
      setSuggestedSubdomain(null);
      setCheckingSubdomain(false);
      return;
    }

    setCheckingSubdomain(true);
    setSubdomainAvailable(null);
    setSuggestedSubdomain(null);

    checkSubdomainTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/projects/check-subdomain?subdomain=${encodeURIComponent(value)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        setSubdomainAvailable(data.available);
        setSuggestedSubdomain(data.suggestion ?? null);
      } catch {
        // Silently fail — user will still get server-side validation on submit
      } finally {
        setCheckingSubdomain(false);
      }
    }, 500);
  }, []);

  // SECURITY: Validate on change
  const handleSubdomainChange = (value: string) => {
    // Auto-sanitize: remove invalid characters, convert to lowercase
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSubdomain(sanitized);

    const error = validateSubdomain(sanitized);
    setValidationErrors((prev) => ({
      ...prev,
      subdomain: error || undefined,
    }));

    checkSubdomainAvailability(sanitized);
  };

  const acceptSuggestion = () => {
    if (!suggestedSubdomain) return;
    setSubdomain(suggestedSubdomain);
    setSuggestedSubdomain(null);
    setSubdomainAvailable(true);
    setValidationErrors((prev) => ({
      ...prev,
      subdomain: undefined,
    }));
  };

  const handleBranchChange = (value: string) => {
    setBranch(value);
    const error = validateBranchName(value);
    setValidationErrors((prev) => ({
      ...prev,
      branch: error || undefined,
    }));
  };

  // Save form state to localStorage
  const saveFormState = useCallback(() => {
    const state: SavedFormState = {
      selectedRepoId,
      name,
      subdomain,
      branch,
      rootDirectory,
      envVars: envVars.map(({ key, value }) => ({ key, value })), // Don't save showValue
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore localStorage errors (quota, etc.)
      console.warn("Failed to save draft:", e);
    }
  }, [selectedRepoId, name, subdomain, branch, rootDirectory, envVars]);

  // Clear saved form state
  const clearFormState = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore errors
    }
    setHasDraft(false);
  }, []);

  // Load saved form state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state: SavedFormState = JSON.parse(saved);
        // Check if draft is not expired
        if (Date.now() - state.savedAt < DRAFT_EXPIRY_MS) {
          setSelectedRepoId(state.selectedRepoId);
          setName(state.name);
          setSubdomain(state.subdomain);
          setBranch(state.branch);
          setRootDirectory(state.rootDirectory);
          setEnvVars(state.envVars);
          setHasDraft(true);
        } else {
          // Draft expired, clear it
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Auto-save form state when values change (debounced)
  useEffect(() => {
    if (selectedRepoId || name || subdomain || envVars.length > 0) {
      const timeoutId = setTimeout(() => {
        saveFormState();
        setHasDraft(true);
      }, 500); // Debounce 500ms

      return () => clearTimeout(timeoutId);
    }
  }, [
    selectedRepoId,
    name,
    subdomain,
    branch,
    rootDirectory,
    envVars,
    saveFormState,
  ]);

  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const res = await fetch("/api/github/repos");
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to fetch repositories");
        }
        const data = await res.json();
        setRepos(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoadingRepos(false);
      }
    };
    fetchRepos();
  }, []);

  // Track if user manually changed repo after draft load
  const [draftRepoId, setDraftRepoId] = useState<string | null>(null);

  // Store the draft repo ID when loading
  useEffect(() => {
    if (hasDraft && selectedRepoId && draftRepoId === null) {
      setDraftRepoId(selectedRepoId);
    }
  }, [hasDraft, selectedRepoId, draftRepoId]);

  // Auto-fill subdomain when repo is selected
  useEffect(() => {
    if (selectedRepo) {
      const isNewSelection =
        !hasDraft || (draftRepoId !== null && selectedRepoId !== draftRepoId);
      if (isNewSelection) {
        setName(selectedRepo.name);
        const autoSubdomain = selectedRepo.name
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
        setSubdomain(autoSubdomain);
        setBranch(selectedRepo.defaultBranch);

        // Validate auto-generated subdomain
        const error = validateSubdomain(autoSubdomain);
        setValidationErrors((prev) => ({
          ...prev,
          subdomain: error || undefined,
        }));

        // Check availability against the database
        checkSubdomainAvailability(autoSubdomain);
      }
    }
  }, [selectedRepo, hasDraft, draftRepoId, selectedRepoId]);

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: "", value: "", showValue: false }]);
  };

  const updateEnvVar = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    const updated = [...envVars];
    updated[index][field] = value;
    setEnvVars(updated);

    // Validate env key on change
    if (field === "key") {
      const error = validateEnvKey(value);
      setValidationErrors((prev) => ({
        ...prev,
        envVars: {
          ...prev.envVars,
          [index]: error || undefined,
        },
      }));
    }
  };

  const toggleEnvVisibility = (index: number) => {
    const updated = [...envVars];
    updated[index].showValue = !updated[index].showValue;
    setEnvVars(updated);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));

    // Clean up validation errors
    setValidationErrors((prev) => {
      const newEnvErrors = { ...prev.envVars };
      delete newEnvErrors[index];
      return { ...prev, envVars: newEnvErrors };
    });
  };

  const parseBulkEnv = () => {
    const lines = bulkEnvInput.split("\n");
    const parsed: EnvVar[] = [];
    const errors: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();

        // Remove surrounding quotes if present
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        // Validate key
        const keyError = validateEnvKey(key);
        if (keyError) {
          errors.push(`${key}: ${keyError}`);
        } else if (key) {
          parsed.push({ key, value, showValue: false });
        }
      }
    }

    if (errors.length > 0) {
      setError(`Environment variable errors:\n${errors.join("\n")}`);
      return;
    }

    setEnvVars([...envVars, ...parsed]);
    setBulkEnvInput("");
    setShowBulkInput(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepo) return;

    // SECURITY: Final validation before submit
    const errors: string[] = [];

    const subdomainError = validateSubdomain(subdomain);
    if (subdomainError) errors.push(`Subdomain: ${subdomainError}`);

    const branchError = validateBranchName(branch);
    if (branchError) errors.push(`Branch: ${branchError}`);

    // Validate all env vars
    envVars.forEach((env, idx) => {
      if (env.key.trim()) {
        const keyError = validateEnvKey(env.key);
        if (keyError) {
          errors.push(`Environment variable ${idx + 1}: ${keyError}`);
        }
      }
    });

    if (errors.length > 0) {
      setError(`Validation failed:\n${errors.join("\n")}`);
      return;
    }

    setError(null);
    setDeployLogs(null);
    setLiveSteps(null);
    setSubmitting(true);

    // Convert envVars array to object (only non-empty keys)
    const envVarsObject: Record<string, string> = {};
    for (const env of envVars) {
      const trimmedKey = env.key.trim();
      if (trimmedKey) {
        envVarsObject[trimmedKey] = env.value;
      }
    }

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          subdomain: subdomain.toLowerCase().trim(),
          repoUrl: selectedRepo.url,
          branch: branch.trim() || selectedRepo.defaultBranch,
          rootDirectory: rootDirectory.trim() || undefined,
          installCommand: installCommand.trim() || undefined,
          buildCommand: buildCommand.trim() || undefined,
          startCommand: startCommand.trim() || undefined,
          envVars:
            Object.keys(envVarsObject).length > 0 ? envVarsObject : undefined,
        }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === "progress") {
            setLiveSteps(event.steps);
          } else if (event.type === "complete") {
            clearFormState();
            router.push("/dashboard/projects");
            return;
          } else if (event.type === "error") {
            if (event.steps) setLiveSteps(event.steps);
            throw new Error(event.error || "Failed to create project");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  // Form is valid if: repo selected, name filled, subdomain valid + available, and no validation errors
  const isValid =
    selectedRepo &&
    name.trim() &&
    subdomain.trim() &&
    !validationErrors.subdomain &&
    subdomainAvailable !== false &&
    !checkingSubdomain &&
    !validationErrors.branch &&
    (!validationErrors.envVars ||
      Object.keys(validationErrors.envVars).length === 0);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Deploy New Project</h1>
        <p className="text-muted-foreground">
          Select a GitHub repository and configure deployment
        </p>
      </div>

      {hasDraft && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-blue-500">
                  Draft restored from previous session
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearFormState();
                  setSelectedRepoId("");
                  setName("");
                  setSubdomain("");
                  setBranch("");
                  setRootDirectory("");
                  setEnvVars([]);
                  setValidationErrors({});
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                Clear Draft
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loadingRepos ? (
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
            <span className="text-muted-foreground">
              Loading your repositories...
            </span>
          </CardContent>
        </Card>
      ) : error && repos.length === 0 ? (
        <Card className="border-destructive">
          <CardContent className="py-6">
            <p className="text-destructive mb-4">{error}</p>
            <p className="text-sm text-muted-foreground">
              Make sure you&apos;re signed in with GitHub and have granted
              repository access.
            </p>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error Display */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="py-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-destructive font-medium whitespace-pre-wrap">
                      {error}
                    </p>
                    {deployLogs && (
                      <details className="mt-2">
                        <summary className="text-sm text-muted-foreground cursor-pointer hover:underline">
                          View deployment logs
                        </summary>
                        <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto max-h-60 whitespace-pre-wrap">
                          {deployLogs}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Repository Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                Repository
              </CardTitle>
              <CardDescription>
                Select a repository from your GitHub account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="repo">GitHub Repository *</Label>
                <Select
                  value={selectedRepoId}
                  onValueChange={setSelectedRepoId}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a repository" />
                  </SelectTrigger>
                  <SelectContent>
                    {repos.map((repo) => (
                      <SelectItem key={repo.id} value={repo.id.toString()}>
                        <div className="flex items-center gap-2">
                          {repo.isPrivate ? (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Globe className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span>{repo.fullName}</span>
                          {repo.language && (
                            <span className="text-xs text-muted-foreground">
                              ({repo.language})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedRepo?.description && (
                  <p className="text-xs text-muted-foreground">
                    {selectedRepo.description}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {selectedRepo && (
            <>
              {/* Project Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Project Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Project Name *</Label>
                      <Input
                        id="name"
                        placeholder="My Portfolio"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        maxLength={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="branch">Branch</Label>
                      <Input
                        id="branch"
                        placeholder={selectedRepo.defaultBranch}
                        value={branch}
                        onChange={(e) => handleBranchChange(e.target.value)}
                        className={
                          validationErrors.branch ? "border-destructive" : ""
                        }
                      />
                      {validationErrors.branch && (
                        <p className="text-xs text-destructive">
                          {validationErrors.branch}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rootDirectory">Root Directory</Label>
                    <Input
                      id="rootDirectory"
                      placeholder="apps/web (for monorepos)"
                      value={rootDirectory}
                      onChange={(e) => setRootDirectory(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty for root. Use for monorepos.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subdomain">Subdomain *</Label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          id="subdomain"
                          placeholder="portfolio"
                          value={subdomain}
                          onChange={(e) =>
                            handleSubdomainChange(e.target.value)
                          }
                          required
                          className={
                            validationErrors.subdomain ||
                            subdomainAvailable === false
                              ? "border-destructive pr-9"
                              : subdomainAvailable === true
                                ? "border-green-500 pr-9"
                                : "pr-9"
                          }
                          maxLength={63}
                        />
                        {checkingSubdomain && (
                          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                        {!checkingSubdomain &&
                          subdomainAvailable === true &&
                          !validationErrors.subdomain && (
                            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                          )}
                        {!checkingSubdomain &&
                          subdomainAvailable === false &&
                          !validationErrors.subdomain && (
                            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                          )}
                      </div>
                      <span className="text-muted-foreground text-sm whitespace-nowrap">
                        .{domain}
                      </span>
                    </div>
                    {validationErrors.subdomain ? (
                      <p className="text-xs text-destructive">
                        {validationErrors.subdomain}
                      </p>
                    ) : subdomainAvailable === false ? (
                      <div className="space-y-1">
                        <p className="text-xs text-destructive">
                          This subdomain is already taken.
                        </p>
                        {suggestedSubdomain && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">
                              Try{" "}
                              <span className="font-mono text-foreground">
                                {suggestedSubdomain}.{domain}
                              </span>
                              ?
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={acceptSuggestion}
                            >
                              Use this
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : fullDomain ? (
                      <p className="text-sm text-muted-foreground">
                        URL:{" "}
                        <span className="font-mono text-foreground">
                          https://{fullDomain}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              {/* Build Settings (optional overrides) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5" />
                    Build Settings
                  </CardTitle>
                  <CardDescription>
                    Leave empty to auto-detect. Override if your project needs
                    custom commands.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="installCommand">Install Command</Label>
                    <Input
                      id="installCommand"
                      placeholder="auto-detected (e.g. pnpm install)"
                      value={installCommand}
                      onChange={(e) => setInstallCommand(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buildCommand">Build Command</Label>
                    <Input
                      id="buildCommand"
                      placeholder="auto-detected (e.g. pnpm build)"
                      value={buildCommand}
                      onChange={(e) => setBuildCommand(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startCommand">Start Command</Label>
                    <Input
                      id="startCommand"
                      placeholder="auto-detected (e.g. next start)"
                      value={startCommand}
                      onChange={(e) => setStartCommand(e.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Environment Variables */}
              <Card>
                <CardHeader>
                  <CardTitle>Environment Variables</CardTitle>
                  <CardDescription>
                    Add environment variables for your application. These will
                    be encrypted and written to .env file.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {envVars.map((env, index) => (
                    <div key={index} className="space-y-1">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            placeholder="DATABASE_URL"
                            value={env.key}
                            onChange={(e) =>
                              updateEnvVar(index, "key", e.target.value)
                            }
                            className={
                              validationErrors.envVars?.[index]
                                ? "font-mono border-destructive"
                                : "font-mono"
                            }
                          />
                        </div>
                        <div className="flex-[2] relative">
                          <Input
                            placeholder="value"
                            value={env.value}
                            onChange={(e) =>
                              updateEnvVar(index, "value", e.target.value)
                            }
                            type={env.showValue ? "text" : "password"}
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full"
                            onClick={() => toggleEnvVisibility(index)}
                          >
                            {env.showValue ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeEnvVar(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      {validationErrors.envVars?.[index] && (
                        <p className="text-xs text-destructive ml-1">
                          {validationErrors.envVars[index]}
                        </p>
                      )}
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addEnvVar}
                    >
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
                          onClick={() => {
                            setShowBulkInput(false);
                            setBulkEnvInput("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    NODE_ENV and PORT are automatically added. All values are
                    encrypted at rest.
                  </p>
                </CardContent>
              </Card>

              {/* Deploy Button */}
              <Button
                type="submit"
                disabled={!isValid || submitting}
                className="w-full"
                size="lg"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Deploying... (this may take a few minutes)
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 h-4 w-4" />
                    Deploy Project
                  </>
                )}
              </Button>

              {submitting && liveSteps && (
                <div className="border rounded-lg p-4 space-y-2 bg-muted/30">
                  {liveSteps.map((step) => (
                    <div key={step.id} className="flex items-center gap-3 text-sm">
                      <span className="w-4 flex-shrink-0">
                        {step.status === "running" && <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />}
                        {step.status === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                        {step.status === "failed" && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                        {step.status === "pending" && <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30 inline-block" />}
                        {step.status === "skipped" && <span className="h-3.5 w-3.5 text-muted-foreground">–</span>}
                      </span>
                      <span className={step.status === "pending" ? "text-muted-foreground" : step.status === "failed" ? "text-destructive" : ""}>
                        {step.name}
                      </span>
                      {step.durationMs && <span className="ml-auto text-xs text-muted-foreground">{(step.durationMs / 1000).toFixed(1)}s</span>}
                    </div>
                  ))}
                </div>
              )}

              {submitting && !liveSteps && (
                <p className="text-sm text-center text-muted-foreground">
                  Connecting to server...
                </p>
              )}

              {!isValid && selectedRepo && name && subdomain && (
                <p className="text-sm text-center text-destructive">
                  Please fix validation errors before deploying
                </p>
              )}
            </>
          )}
        </form>
      )}
    </div>
  );
}
