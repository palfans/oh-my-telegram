import { spawn, ChildProcess } from 'child_process';
import { Readable } from 'stream';

/**
 * OpenCode execution result
 */
export interface OpenCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Options for executing OpenCode
 */
export interface OpenCodeOptions {
  cwd?: string;
  agent?: string;
  session?: string;
  model?: string;
  env?: Record<string, string>;
}

/**
 * OpenCode bridge - Executes opencode CLI and captures output
 */
export class OpenCodeBridge {
  private opencodePath: string;
  private defaultOptions: OpenCodeOptions;

  constructor(options: { opencodePath?: string; defaultOptions?: OpenCodeOptions } = {}) {
    this.opencodePath = options.opencodePath || 'opencode';
    this.defaultOptions = options.defaultOptions || {};
  }

  /**
   * Execute opencode with a message
   */
  async run(message: string, options: OpenCodeOptions = {}): Promise<OpenCodeResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    return new Promise((resolve, reject) => {
      const args = ['run', message];

      if (mergedOptions.agent) {
        args.push('--agent', mergedOptions.agent);
      }

      if (mergedOptions.session) {
        args.push('--session', mergedOptions.session);
      }

      if (mergedOptions.model) {
        args.push('--model', mergedOptions.model);
      }

      const env = { ...process.env, ...mergedOptions.env };

      const opencode = spawn(this.opencodePath, args, {
        cwd: mergedOptions.cwd || process.cwd(),
        env,
      });

      let stdout = '';
      let stderr = '';

      opencode.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
      });

      opencode.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
      });

      opencode.on('close', (code) => {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
        });
      });

      opencode.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Stream opencode output in real-time
   */
  async *stream(
    message: string,
    options: OpenCodeOptions = {}
  ): AsyncGenerator<string, OpenCodeResult, unknown> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    const args = ['run', message];

    if (mergedOptions.agent) {
      args.push('--agent', mergedOptions.agent);
    }

    if (mergedOptions.session) {
      args.push('--session', mergedOptions.session);
    }

    if (mergedOptions.model) {
      args.push('--model', mergedOptions.model);
    }

    const env = { ...process.env, ...mergedOptions.env };

    const opencode = spawn(this.opencodePath, args, {
      cwd: mergedOptions.cwd || process.cwd(),
      env,
    });

    let stdout = '';
    let stderr = '';

    // Stream stdout
    if (opencode.stdout) {
      opencode.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
      });
    }

    // Stream stderr
    if (opencode.stderr) {
      opencode.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
      });
    }

    // Wait for completion
    const exitCode = await new Promise<number | null>((resolve) => {
      opencode.on('close', resolve);
    });

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode,
    };
  }
}
