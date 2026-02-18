import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { prepareStaging, collectFiles, diffTrees } from "../src/sync.js";
import { createTmpDir, createMockSourceDir } from "./fixtures.js";

describe("prepareStaging", () => {
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

  test("copies regular files", () => {
    const base = tmpDir();
    const source = createMockSourceDir(base);
    const staging = prepareStaging(source, ["CLAUDE.md", "settings.json"]);
    tmpDirs.push(staging);
    expect(fs.readFileSync(path.join(staging, "CLAUDE.md"), "utf-8")).toBe("# My Config\n");
    expect(fs.readFileSync(path.join(staging, "settings.json"), "utf-8")).toBe('{"key": "value"}\n');
  });

  test("copies directories", () => {
    const base = tmpDir();
    const source = createMockSourceDir(base);
    const staging = prepareStaging(source, ["commands"]);
    tmpDirs.push(staging);
    expect(fs.existsSync(path.join(staging, "commands", "commit.md"))).toBe(true);
    expect(fs.existsSync(path.join(staging, "commands", "review.md"))).toBe(true);
  });

  test("skips missing paths", () => {
    const base = tmpDir();
    const source = createMockSourceDir(base);
    const staging = prepareStaging(source, ["CLAUDE.md", "nonexistent.txt"]);
    tmpDirs.push(staging);
    expect(fs.existsSync(path.join(staging, "CLAUDE.md"))).toBe(true);
    expect(fs.existsSync(path.join(staging, "nonexistent.txt"))).toBe(false);
  });

  test("preserves symlinks when not resolving", () => {
    const base = tmpDir();
    const source = createMockSourceDir(base);
    const staging = prepareStaging(source, ["skills"], false);
    tmpDirs.push(staging);
    const link = path.join(staging, "skills", "ext-skill");
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  });

  test("resolves symlinks when requested", () => {
    const base = tmpDir();
    const source = createMockSourceDir(base);
    const staging = prepareStaging(source, ["skills"], true);
    tmpDirs.push(staging);
    const resolved = path.join(staging, "skills", "ext-skill");
    expect(fs.lstatSync(resolved).isSymbolicLink()).toBe(false);
    expect(fs.statSync(resolved).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(resolved, "ext-skill.md"), "utf-8")).toBe("external skill content\n");
  });
});

describe("collectFiles", () => {
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

  test("collects single files", () => {
    const base = tmpDir();
    const source = createMockSourceDir(base);
    const files = collectFiles(source, ["CLAUDE.md"]);
    expect(files["CLAUDE.md"]).toBe("# My Config\n");
  });

  test("collects directory files", () => {
    const base = tmpDir();
    const source = createMockSourceDir(base);
    const files = collectFiles(source, ["commands"]);
    expect(files["commands/commit.md"]).toBeDefined();
    expect(files["commands/review.md"]).toBeDefined();
  });

  test("skips missing paths", () => {
    const base = tmpDir();
    const source = createMockSourceDir(base);
    const files = collectFiles(source, ["nonexistent"]);
    expect(Object.keys(files)).toHaveLength(0);
  });
});

describe("diffTrees", () => {
  test("identical trees", () => {
    const a = { "file.md": "hello\n" };
    const b = { "file.md": "hello\n" };
    expect(diffTrees(a, b)).toEqual([]);
  });

  test("local only file", () => {
    const local = { "new.md": "content\n" };
    const remote = {};
    const diffs = diffTrees(local, remote);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toContain("local only");
  });

  test("remote only file", () => {
    const local = {};
    const remote = { "old.md": "content\n" };
    const diffs = diffTrees(local, remote);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toContain("remote only");
  });

  test("modified file", () => {
    const local = { "file.md": "new content\n" };
    const remote = { "file.md": "old content\n" };
    const diffs = diffTrees(local, remote);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toContain("---");
    expect(diffs[0]).toContain("+++");
  });
});
