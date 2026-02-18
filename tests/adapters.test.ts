import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createAdapter, LocalEnvironment, DockerEnvironment, SshEnvironment } from "../src/adapters/index.js";
import { createTmpDir } from "./fixtures.js";

describe("createAdapter", () => {
  test("creates docker adapter", () => {
    const adapter = createAdapter({ type: "docker", image: "test:latest" });
    expect(adapter).toBeInstanceOf(DockerEnvironment);
  });

  test("creates ssh adapter", () => {
    const adapter = createAdapter({ type: "ssh", host: "myhost" });
    expect(adapter).toBeInstanceOf(SshEnvironment);
  });

  test("creates local adapter", () => {
    const adapter = createAdapter({ type: "local" });
    expect(adapter).toBeInstanceOf(LocalEnvironment);
  });

  test("unknown type throws", () => {
    expect(() => createAdapter({ type: "ftp" })).toThrow("Unknown environment type");
  });
});

describe("LocalEnvironment", () => {
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

  test("is always available", () => {
    const adapter = new LocalEnvironment();
    expect(adapter.isAvailable()).toBe(true);
  });

  test("read file", () => {
    const dir = tmpDir();
    const f = path.join(dir, "test.txt");
    fs.writeFileSync(f, "hello");
    const adapter = new LocalEnvironment();
    expect(adapter.readFile(f)).toBe("hello");
  });

  test("read missing file returns null", () => {
    const adapter = new LocalEnvironment();
    expect(adapter.readFile("/nonexistent/path")).toBeNull();
  });

  test("list files", () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    const sub = path.join(dir, "sub");
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, "b.txt"), "b");
    const adapter = new LocalEnvironment();
    const files = adapter.listFiles(dir);
    expect(files).toContain("a.txt");
    expect(files).toContain("sub/b.txt");
  });

  test("deploy and clean", () => {
    const dir = tmpDir();
    const staging = path.join(dir, "staging");
    fs.mkdirSync(staging);
    fs.writeFileSync(path.join(staging, "file.md"), "content");
    const subdir = path.join(staging, "commands");
    fs.mkdirSync(subdir);
    fs.writeFileSync(path.join(subdir, "cmd.md"), "cmd content");

    const target = path.join(dir, "target");
    const adapter = new LocalEnvironment();
    const deployed = adapter.deploy(staging, target, ["file.md", "commands"]);
    expect(deployed).toContain("file.md");
    expect(deployed).toContain("commands");
    expect(fs.readFileSync(path.join(target, "file.md"), "utf-8")).toBe("content");
    expect(fs.readFileSync(path.join(target, "commands", "cmd.md"), "utf-8")).toBe("cmd content");

    adapter.clean(target, ["file.md", "commands"]);
    expect(fs.existsSync(path.join(target, "file.md"))).toBe(false);
    expect(fs.existsSync(path.join(target, "commands"))).toBe(false);
  });

  test("display name", () => {
    const adapter = new LocalEnvironment();
    expect(adapter.displayName).toBe("local");
  });
});

describe("DockerEnvironment", () => {
  test("display name includes container id", () => {
    const adapter = new DockerEnvironment("test:latest");
    adapter.containerId = "abc123def456";
    expect(adapter.displayName).toContain("abc123def456");
  });
});

describe("SshEnvironment", () => {
  test("display name", () => {
    const adapter = new SshEnvironment("myhost");
    expect(adapter.displayName).toBe("ssh myhost");
  });
});
