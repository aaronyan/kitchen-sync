export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export abstract class Environment {
  abstract isAvailable(): boolean;
  abstract run(cmd: string[]): RunResult;
  abstract readFile(filePath: string): string | null;
  abstract listFiles(dirPath: string): string[];
  abstract deploy(stagingDir: string, targetDir: string, syncPaths: string[]): string[];
  abstract clean(targetDir: string, syncPaths: string[]): void;
  abstract get displayName(): string;
}
