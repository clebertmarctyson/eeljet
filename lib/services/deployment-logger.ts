// deployment-logger.ts
export interface DeploymentStep {
  id: string;
  name: string;
  command?: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt?: string;
  finishedAt?: string;
  output?: string;
  error?: string;
  durationMs?: number;
}

export type LoggerProgressCallback = (
  steps: DeploymentStep[],
  textLog: string,
) => void;

export class DeploymentLogger {
  private steps: DeploymentStep[] = [];
  private textLog = "";
  private stepIndex = 0;

  constructor(private onUpdate?: LoggerProgressCallback) {}

  private notify(): void {
    this.onUpdate?.([...this.steps], this.textLog);
  }

  addStep(name: string, command?: string): string {
    const id = `step-${this.stepIndex++}`;
    this.steps.push({
      id,
      name,
      command: command ? this.sanitizeCommand(command) : undefined,
      status: "pending",
    });
    return id;
  }

  startStep(stepId: string): void {
    const step = this.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = "running";
      step.startedAt = new Date().toISOString();
      this.appendText(`START: ${step.name}`);
      if (step.command) {
        this.appendText(`  Command: ${step.command}`);
      }
      this.notify();
    }
  }

  completeStep(stepId: string, output?: string): void {
    const step = this.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = "success";
      step.finishedAt = new Date().toISOString();
      step.durationMs =
        new Date(step.finishedAt).getTime() -
        new Date(step.startedAt!).getTime();
      step.output = output ? output.substring(0, 5000) : undefined;
      this.appendText(`DONE: ${step.name} (${step.durationMs}ms)`);
      this.notify();
    }
  }

  failStep(stepId: string, error: string, output?: string): void {
    const step = this.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = "failed";
      step.finishedAt = new Date().toISOString();
      step.durationMs =
        new Date(step.finishedAt).getTime() -
        new Date(step.startedAt!).getTime();
      step.error = error;
      step.output = output ? output.substring(0, 5000) : undefined;
      this.appendText(`FAILED: ${step.name} - ${error}`);
      this.notify();
    }
  }

  skipStep(stepId: string, reason?: string): void {
    const step = this.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = "skipped";
      this.appendText(`SKIPPED: ${step.name}${reason ? ` (${reason})` : ""}`);
      this.notify();
    }
  }

  getSteps(): DeploymentStep[] {
    return [...this.steps];
  }

  getTextLog(): string {
    return this.textLog;
  }

  getFailedStepId(): string | null {
    const failed = this.steps.find((s) => s.status === "failed");
    return failed?.id ?? null;
  }

  getFailedStepName(): string | null {
    const failed = this.steps.find((s) => s.status === "failed");
    return failed?.name ?? null;
  }

  toJSON(): string {
    return JSON.stringify({
      steps: this.steps,
      textLog: this.textLog,
    });
  }

  private appendText(msg: string): void {
    this.textLog += `[${new Date().toISOString()}] ${msg}\n`;
  }

  private sanitizeCommand(command: string): string {
    return command
      .replace(/GIT_ASKPASS="[^"]*"/g, 'GIT_ASKPASS="***"')
      .replace(/echo\s+"[^"]*"/g, 'echo "***"')
      .replace(
        /cat > "[^"]*" << 'EELJET_CRED_EOF'[\s\S]*?EELJET_CRED_EOF/g,
        "[credential setup]",
      );
  }
}
