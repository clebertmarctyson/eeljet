// ssh-client.ts
import { Client, type ConnectConfig } from "ssh2";

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  privateKey: string;
}

export interface SSHExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface SSHExecOptions {
  timeout?: number; // Timeout in milliseconds
}

/**
 * Execute a command on a remote server via SSH
 */
export async function sshExec(
  config: SSHConfig,
  command: string,
  options?: SSHExecOptions,
): Promise<SSHExecResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let resolved = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const connectConfig: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      privateKey: config.privateKey,
      readyTimeout: 30000,
    };

    // Set up timeout if specified
    if (options?.timeout) {
      timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          conn.end();
          reject(new Error(`Command timed out after ${options.timeout}ms`));
        }
      }, options.timeout);
    }

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            cleanup();
            conn.end();
            if (!resolved) {
              resolved = true;
              return reject(err);
            }
            return;
          }

          let stdout = "";
          let stderr = "";

          stream
            .on("close", (code: number) => {
              cleanup();
              conn.end();
              if (!resolved) {
                resolved = true;
                resolve({ stdout, stderr, code: code || 0 });
              }
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString();
            })
            .stderr.on("data", (data: Buffer) => {
              stderr += data.toString();
            });
        });
      })
      .on("error", (err) => {
        cleanup();
        if (!resolved) {
          resolved = true;
          reject(new Error(`SSH connection failed: ${err.message}`));
        }
      })
      .connect(connectConfig);
  });
}

/**
 * Write content to a file on remote server via SSH
 */
export async function sshWriteFile(
  config: SSHConfig,
  remotePath: string,
  content: string,
): Promise<void> {
  // Use heredoc to write content, escaping special characters
  const escapedContent = content.replace(/'/g, "'\\''");
  const command = `cat > ${remotePath} << 'EELJET_EOF'
${content}
EELJET_EOF`;

  const result = await sshExec(config, command);
  if (result.code !== 0) {
    throw new Error(`Failed to write file ${remotePath}: ${result.stderr}`);
  }
}

/**
 * Read a file from remote server via SSH
 */
export async function sshReadFile(
  config: SSHConfig,
  remotePath: string,
): Promise<string> {
  const result = await sshExec(config, `sudo cat ${remotePath}`);
  if (result.code !== 0) {
    throw new Error(`Failed to read file ${remotePath}: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * Check if a file exists on remote server
 */
export async function sshFileExists(
  config: SSHConfig,
  remotePath: string,
): Promise<boolean> {
  const result = await sshExec(
    config,
    `sudo test -f ${remotePath} && echo "exists"`,
  );
  return result.stdout.trim() === "exists";
}

/**
 * List files in a directory on remote server
 */
export async function sshListDir(
  config: SSHConfig,
  remotePath: string,
): Promise<string[]> {
  const result = await sshExec(
    config,
    `ls -1 ${remotePath} 2>/dev/null || true`,
  );
  if (result.code !== 0 && result.stderr) {
    throw new Error(`Failed to list directory ${remotePath}: ${result.stderr}`);
  }
  return result.stdout.trim().split("\n").filter(Boolean);
}

/**
 * Test SSH connection
 */
export async function testSSHConnection(config: SSHConfig): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const result = await sshExec(config, "echo 'EelJet connection test'");
    if (result.stdout.includes("EelJet connection test")) {
      return { success: true };
    }
    return { success: false, error: "Unexpected response from server" };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
