import { spawnSync } from "child_process";
import { Environment, type RunResult } from "./base.js";

const DOCKER_IMAGE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._\/:@-]*$/;

export class DockerEnvironment extends Environment {
  private image: string;
  private _containerId: string | null = null;

  constructor(image: string) {
    super();
    if (!DOCKER_IMAGE_RE.test(image) || /\0/.test(image)) {
      throw new Error(`Invalid Docker image name: ${image}`);
    }
    this.image = image;
  }

  get containerId(): string | null {
    if (this._containerId === null) {
      const result = spawnSync(
        "docker",
        ["ps", "--filter", `ancestor=${this.image}`, "--format", "{{.ID}}"],
        { encoding: "utf-8" },
      );
      const ids = (result.stdout ?? "").trim().split("\n").filter(Boolean);
      if (ids.length > 0) {
        this._containerId = ids[0];
      }
    }
    return this._containerId;
  }

  // Exposed for testing
  set containerId(id: string | null) {
    this._containerId = id;
  }

  isAvailable(): boolean {
    return this.containerId !== null;
  }

  run(cmd: string[]): RunResult {
    const cid = this.containerId;
    if (!cid) {
      throw new Error(`No running container for image ${this.image}`);
    }
    const result = spawnSync("docker", ["exec", cid, ...cmd], { encoding: "utf-8" });
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
    const cid = this.containerId;
    if (!cid) {
      throw new Error(`No running container for image ${this.image}`);
    }

    // Ensure target dir exists
    this.run(["mkdir", "-p", targetDir]);

    const deployed: string[] = [];
    for (const sp of syncPaths) {
      const src = `${stagingDir}/${sp}`;
      // Check if source exists using node fs (staging is local)
      try {
        const { statSync } = require("fs");
        statSync(src);
      } catch {
        continue;
      }

      const remotePath = `${targetDir}/${sp}`;
      spawnSync("docker", ["cp", src, `${cid}:${remotePath}`], { encoding: "utf-8" });
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
    const shortId = this._containerId ? this._containerId.slice(0, 12) : "?";
    return `docker container ${shortId}`;
  }
}
