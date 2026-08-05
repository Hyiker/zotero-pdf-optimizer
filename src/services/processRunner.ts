import type { ProcessResult } from "../core/types";

interface SubprocessPipe {
  readonly closed: boolean;
  readString(): Promise<string>;
}

interface SubprocessHandle {
  stdout: SubprocessPipe;
  stderr: SubprocessPipe;
  wait(): Promise<{ exitCode: number }>;
  kill(): Promise<{ exitCode: number }>;
}

interface SubprocessAPI {
  call(options: {
    command: string;
    arguments: string[];
    stdout: "pipe";
    stderr: "pipe";
  }): Promise<SubprocessHandle>;
  pathSearch(command: string): Promise<string> | string;
}

let subprocess: SubprocessAPI | undefined;

export function getSubprocess(): SubprocessAPI {
  if (!subprocess) {
    const module = ChromeUtils.importESModule(
      "resource://gre/modules/Subprocess.sys.mjs",
    ) as unknown as { Subprocess: SubprocessAPI };
    subprocess = module.Subprocess;
  }
  return subprocess;
}

export class ProcessRunner {
  private active = new Set<SubprocessHandle>();

  constructor(private readonly timeoutMS = 60000) {}

  async run(command: string, args: readonly string[]): Promise<ProcessResult> {
    const process = await getSubprocess().call({
      command,
      arguments: [...args],
      stdout: "pipe",
      stderr: "pipe",
    });
    this.active.add(process);
    let timedOut = false;
    let timeoutID: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<{ exitCode: number }>((resolve) => {
        timeoutID = setTimeout(() => {
          timedOut = true;
          void process
            .kill()
            .then(resolve)
            .catch(() => resolve({ exitCode: -9 }));
        }, this.timeoutMS);
      });
      const [stdout, stderr, result] = await Promise.all([
        this.readAll(process.stdout),
        this.readAll(process.stderr),
        Promise.race([process.wait(), timeout]),
      ]);
      return {
        exitCode: result.exitCode,
        stdout,
        stderr: timedOut
          ? `${stderr}${stderr ? "\n" : ""}Process timed out after ${this.timeoutMS} ms`
          : stderr,
      };
    } finally {
      if (timeoutID !== undefined) clearTimeout(timeoutID);
      this.active.delete(process);
    }
  }

  shutdown(): void {
    for (const process of this.active) {
      try {
        void process.kill();
      } catch {
        // The process may have exited between iteration and kill().
      }
    }
    this.active.clear();
  }

  private async readAll(pipe: SubprocessPipe): Promise<string> {
    let output = "";
    while (!pipe.closed) {
      const chunk = await pipe.readString();
      if (!chunk && pipe.closed) break;
      output += chunk;
    }
    return output;
  }
}
