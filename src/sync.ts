import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync, spawnSync } from "child_process";
import { createTwoFilesPatch } from "diff";

export function prepareStaging(
  sourceDir: string,
  syncPaths: string[],
  resolveSymlinks = false,
): string {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "ksync-"));

  for (const sp of syncPaths) {
    const src = path.join(sourceDir, sp);
    if (!fs.existsSync(src)) continue;

    const dst = path.join(staging, sp);
    const stat = fs.lstatSync(src);

    if (stat.isFile() || (stat.isSymbolicLink() && !fs.statSync(src).isDirectory())) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      if (resolveSymlinks && stat.isSymbolicLink()) {
        const real = fs.realpathSync(src);
        const realStat = fs.statSync(real);
        if (realStat.isDirectory()) {
          copyDirRecursive(real, dst, false);
        } else {
          fs.copyFileSync(real, dst);
        }
      } else if (stat.isSymbolicLink() && !resolveSymlinks) {
        fs.symlinkSync(fs.readlinkSync(src), dst);
      } else {
        fs.copyFileSync(src, dst);
      }
    } else if (stat.isDirectory()) {
      copyDirRecursive(src, dst, resolveSymlinks);
    } else if (stat.isSymbolicLink()) {
      // Symlink pointing to a directory
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      if (resolveSymlinks) {
        const real = fs.realpathSync(src);
        copyDirRecursive(real, dst, false);
      } else {
        fs.symlinkSync(fs.readlinkSync(src), dst);
      }
    }
  }

  return staging;
}

function copyDirRecursive(src: string, dst: string, resolveSymlinks: boolean): void {
  fs.mkdirSync(dst, { recursive: true });

  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const dstPath = path.join(dst, entry);
    const stat = fs.lstatSync(srcPath);

    if (stat.isSymbolicLink()) {
      if (resolveSymlinks) {
        let real: string;
        try {
          real = fs.realpathSync(srcPath);
        } catch {
          // Skip broken symlinks
          continue;
        }
        const realStat = fs.statSync(real);
        if (realStat.isDirectory()) {
          copyDirRecursive(real, dstPath, false);
        } else if (realStat.isFile()) {
          fs.copyFileSync(real, dstPath);
        }
      } else {
        fs.symlinkSync(fs.readlinkSync(srcPath), dstPath);
      }
    } else if (stat.isDirectory()) {
      copyDirRecursive(srcPath, dstPath, resolveSymlinks);
    } else if (stat.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

export function collectFiles(baseDir: string, syncPaths: string[]): Record<string, string> {
  const files: Record<string, string> = {};

  for (const sp of syncPaths) {
    const src = path.join(baseDir, sp);
    if (!fs.existsSync(src)) continue;

    const stat = fs.statSync(src);
    if (stat.isFile()) {
      try {
        files[sp] = fs.readFileSync(src, "utf-8");
      } catch {
        files[sp] = "<binary>";
      }
    } else if (stat.isDirectory()) {
      collectDir(src, baseDir, files);
    }
  }

  return files;
}

function collectDir(dir: string, baseDir: string, files: Record<string, string>): void {
  for (const entry of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      const rel = path.relative(baseDir, full);
      try {
        files[rel] = fs.readFileSync(full, "utf-8");
      } catch {
        files[rel] = "<binary>";
      }
    } else if (stat.isDirectory()) {
      collectDir(full, baseDir, files);
    }
  }
}

export function diffTrees(
  localFiles: Record<string, string>,
  remoteFiles: Record<string, string>,
): string[] {
  const allPaths = [...new Set([...Object.keys(localFiles), ...Object.keys(remoteFiles)])].sort();
  const diffs: string[] = [];

  for (const p of allPaths) {
    const localContent = localFiles[p] ?? "";
    const remoteContent = remoteFiles[p] ?? "";

    if (localContent === remoteContent) continue;

    if (!(p in remoteFiles)) {
      diffs.push(`  + ${p} (local only)`);
      continue;
    }

    if (!(p in localFiles)) {
      diffs.push(`  - ${p} (remote only)`);
      continue;
    }

    const patch = createTwoFilesPatch(
      `remote/${p}`,
      `local/${p}`,
      remoteContent,
      localContent,
    );
    if (patch) {
      diffs.push(patch);
    }
  }

  return diffs;
}

export function gitStatusForPaths(
  repoDir: string,
  syncPaths: string[],
  gitEnv?: Record<string, string>,
): { modified: string[]; ahead: number; behind: number } {
  const env = { ...process.env, ...(gitEnv ?? {}) };

  // Get status for sync paths
  const statusResult = spawnSync(
    "git",
    ["status", "--porcelain", "--", ...syncPaths],
    { cwd: repoDir, env, encoding: "utf-8" },
  );
  const modified: string[] = [];
  for (const line of (statusResult.stdout ?? "").trim().split("\n")) {
    if (line.trim()) {
      modified.push(line.trim());
    }
  }

  // Get ahead/behind
  let ahead = 0;
  let behind = 0;
  const revResult = spawnSync(
    "git",
    ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    { cwd: repoDir, env, encoding: "utf-8" },
  );
  if (revResult.status === 0 && revResult.stdout?.trim()) {
    const parts = revResult.stdout.trim().split(/\s+/);
    if (parts.length === 2) {
      ahead = parseInt(parts[0], 10);
      behind = parseInt(parts[1], 10);
    }
  }

  return { modified, ahead, behind };
}

export function gitPush(
  repoDir: string,
  syncPaths: string[],
  message: string,
  gitEnv?: Record<string, string>,
  dryRun = false,
): { commit_hash: string | null; files_staged: string[] } {
  const env = { ...process.env, ...(gitEnv ?? {}) };

  // Stage files
  spawnSync("git", ["add", "--", ...syncPaths], { cwd: repoDir, env });

  // Check if there's anything to commit
  const diffResult = spawnSync(
    "git",
    ["diff", "--cached", "--name-only"],
    { cwd: repoDir, env, encoding: "utf-8" },
  );
  const staged = (diffResult.stdout ?? "").trim().split("\n").filter(Boolean);

  if (staged.length === 0) {
    return { commit_hash: null, files_staged: [] };
  }

  if (dryRun) {
    // Unstage
    spawnSync("git", ["reset", "HEAD", "--", ...syncPaths], { cwd: repoDir, env });
    return { commit_hash: "(dry-run)", files_staged: staged };
  }

  // Commit
  spawnSync("git", ["commit", "-m", message], { cwd: repoDir, env });

  // Get commit hash
  const hashResult = spawnSync(
    "git",
    ["rev-parse", "--short", "HEAD"],
    { cwd: repoDir, env, encoding: "utf-8" },
  );
  const commitHash = (hashResult.stdout ?? "").trim();

  // Push
  spawnSync("git", ["push"], { cwd: repoDir, env });

  return { commit_hash: commitHash, files_staged: staged };
}

export function gitPull(
  repoDir: string,
  gitEnv?: Record<string, string>,
  dryRun = false,
): string {
  const env = { ...process.env, ...(gitEnv ?? {}) };

  if (dryRun) {
    const result = spawnSync(
      "git",
      ["fetch", "--dry-run"],
      { cwd: repoDir, env, encoding: "utf-8" },
    );
    return (result.stderr ?? "").trim() || "Already up to date.";
  }

  const result = spawnSync(
    "git",
    ["pull"],
    { cwd: repoDir, env, encoding: "utf-8" },
  );
  if (result.status !== 0) {
    throw new Error((result.stderr ?? "").trim() || "git pull failed");
  }
  return (result.stdout ?? "").trim() || "Already up to date.";
}
