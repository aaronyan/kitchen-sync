import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { Environment, type RunResult } from "./base.js";

export class LocalEnvironment extends Environment {
  isAvailable(): boolean {
    return true;
  }

  run(cmd: string[]): RunResult {
    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: "utf-8" });
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status ?? 1,
    };
  }

  readFile(filePath: string): string | null {
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return fs.readFileSync(filePath, "utf-8");
      }
    } catch {
      // UnicodeDecodeError or PermissionError equivalent
    }
    return null;
  }

  listFiles(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) return [];
    const files: string[] = [];
    walkDir(dirPath, dirPath, files);
    return files.sort();
  }

  deploy(stagingDir: string, targetDir: string, syncPaths: string[]): string[] {
    fs.mkdirSync(targetDir, { recursive: true });
    const deployed: string[] = [];

    for (const sp of syncPaths) {
      const src = path.join(stagingDir, sp);
      if (!fs.existsSync(src)) continue;

      const dst = path.join(targetDir, sp);
      const stat = fs.statSync(src);

      if (stat.isDirectory()) {
        if (fs.existsSync(dst)) {
          fs.rmSync(dst, { recursive: true, force: true });
        }
        fs.cpSync(src, dst, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
      }
      deployed.push(sp);
    }

    return deployed;
  }

  clean(targetDir: string, syncPaths: string[]): void {
    for (const sp of syncPaths) {
      const p = path.join(targetDir, sp);
      if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          fs.rmSync(p, { recursive: true, force: true });
        } else {
          fs.unlinkSync(p);
        }
      }
    }
  }

  get displayName(): string {
    return "local";
  }
}

function walkDir(dir: string, baseDir: string, files: string[]): void {
  for (const entry of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      files.push(path.relative(baseDir, full));
    } else if (stat.isDirectory()) {
      walkDir(full, baseDir, files);
    }
  }
}
