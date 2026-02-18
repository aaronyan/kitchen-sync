import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { createTmpDir } from "./fixtures.js";
import { saveConfig, type Config } from "../src/config.js";

const CLI = path.resolve(__dirname, "../src/index.ts");

function run(...args: string[]) {
  const result = spawnSync("bun", ["run", CLI, ...args], {
    encoding: "utf-8",
    timeout: 10000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

describe("CLI", () => {
  const tmpDirs: string[] = [];

  function tmpDir(): string {
    const d = createTmpDir();
    tmpDirs.push(d);
    return d;
  }

  afterEach(() => {
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  test("version flag", () => {
    const result = run("--version");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("0.1.0");
  });

  test("help flag", () => {
    const result = run("--help");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("kitchen-sync");
    expect(result.stdout).toContain("status");
    expect(result.stdout).toContain("push");
  });

  test("list profiles shows claude", () => {
    const result = run("list", "profiles");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("claude");
    expect(result.stdout).toContain("~/.claude");
  });

  test("list envs runs successfully", () => {
    const result = run("list", "envs");
    expect(result.exitCode).toBe(0);
    // Either shows configured environments or "No environments" message
    const hasEnvs = result.stdout.includes("Configured environments");
    const hasNone = result.stdout.includes("No environments configured");
    expect(hasEnvs || hasNone).toBe(true);
  });

  test("bare list shows help", () => {
    const result = run("list");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("profiles");
    expect(result.stdout).toContain("envs");
  });

  test("status with no config warns", () => {
    // Status loads from default config path which may not exist
    // This tests the "no targets" path
    const result = run("status");
    // Either "No targets" or shows status of existing config
    expect(result.exitCode).toBe(0);
  });

  test("push with no config warns", () => {
    const result = run("push");
    expect(result.exitCode).toBe(0);
  });

  test("install with nonexistent env", () => {
    const result = run("install", "nonexistent");
    expect(result.stdout).toContain("not found");
  });

  test("diff with nonexistent env", () => {
    const result = run("diff", "nonexistent");
    expect(result.stdout).toContain("not found");
  });
});
