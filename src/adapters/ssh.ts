import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { Environment, type RunResult } from "./base.js";

export class SshEnvironment extends Environment {
  private host: string;

  constructor(host: string) {
    super();
    if (/^-/.test(host) || /\0/.test(host)) {
      throw new Error(`Invalid SSH host: ${host}`);
    }
    this.host = host;
  }

  isAvailable(): boolean {
    const result = spawnSync(
      "ssh",
      ["-o", "ConnectTimeout=5", "--", this.host, "true"],
      { encoding: "utf-8" },
    );
    return result.status === 0;
  }

  run(cmd: string[]): RunResult {
    const result = spawnSync("ssh", ["--", this.host, ...cmd], { encoding: "utf-8" });
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status ?? 1,
    };
  }

  readFile(filePath: string): string | null {
    const result = this.run(["cat", filePath]);
    if (result.exitCode === 0) {
      return result.stdout;
    }
    return null;
  }

  listFiles(dirPath: string): string[] {
    const result = this.run(["find", dirPath, "-type", "f"]);
    if (result.exitCode !== 0) return [];
    const files: string[] = [];
    for (const line of result.stdout.trim().split("\n")) {
      if (line.startsWith(dirPath)) {
        const rel = line.slice(dirPath.length).replace(/^\//, "");
        if (rel) files.push(rel);
      }
    }
    return files.sort();
  }

  deploy(stagingDir: string, targetDir: string, syncPaths: string[]): string[] {
    const deployed: string[] = [];

    // Ensure target dir exists
    this.run(["mkdir", "-p", targetDir]);

    for (const sp of syncPaths) {
      const src = path.join(stagingDir, sp);
      // Check if source exists using node fs (staging is local)
      try {
        fs.statSync(src);
      } catch {
        continue;
      }

      const remotePath = `${this.host}:${targetDir}/${sp}`;
      const srcStat = fs.statSync(src);

      if (srcStat.isDirectory()) {
        const parentDir = `${targetDir}/${sp}`;
        this.run(["mkdir", "-p", parentDir]);
        spawnSync(
          "rsync",
          ["-avz", "--delete", "-e", "ssh", `${src}/`, `${remotePath}/`],
          { encoding: "utf-8" },
        );
      } else {
        const parentDir = path.dirname(`${targetDir}/${sp}`);
        this.run(["mkdir", "-p", parentDir]);
        spawnSync(
          "rsync",
          ["-avz", "-e", "ssh", src, remotePath],
          { encoding: "utf-8" },
        );
      }
      deployed.push(sp);
    }

    return deployed;
  }

  clean(targetDir: string, syncPaths: string[]): void {
    for (const sp of syncPaths) {
      this.run(["rm", "-rf", `${targetDir}/${sp}`]);
    }
  }

  get displayName(): string {
    return `ssh ${this.host}`;
  }
}
