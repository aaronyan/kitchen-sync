import { describe, test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { loadConfig, saveConfig, getTarget, getEnvironment, localPath, type Config } from "../src/config.js";
import { createTmpDir, sampleConfig } from "./fixtures.js";

describe("Config", () => {
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

  test("load missing file returns empty config", () => {
    const configPath = path.join(tmpDir(), "nonexistent.json");
    const config = loadConfig(configPath);
    expect(config.version).toBe(1);
    expect(config.targets).toEqual([]);
    expect(config.environments).toEqual({});
  });

  test("save and load roundtrip", () => {
    const configPath = path.join(tmpDir(), "config.json");
    const config = sampleConfig();
    saveConfig(config, configPath);
    const loaded = loadConfig(configPath);

    expect(loaded.version).toBe(1);
    expect(loaded.targets).toHaveLength(1);
    expect(loaded.targets[0].name).toBe("claude");
    expect(loaded.targets[0].repo).toBe("git@example.com:user/dot-claude.git");
    expect(loaded.targets[0].sync_paths).toEqual(["CLAUDE.md", "settings.json", "commands"]);
    expect(loaded.targets[0].git_env).toEqual({ HTTPS_PROXY: "socks5://127.0.0.1:8080" });
  });

  test("environment roundtrip", () => {
    const configPath = path.join(tmpDir(), "config.json");
    const config = sampleConfig();
    saveConfig(config, configPath);
    const loaded = loadConfig(configPath);

    expect(loaded.environments["docker-test"]).toBeDefined();
    const dockerEnv = loaded.environments["docker-test"];
    expect(dockerEnv.type).toBe("docker");
    expect(dockerEnv.image).toBe("test-image:latest");
    expect(dockerEnv.targets["claude"]).toBeDefined();
    expect(dockerEnv.targets["claude"].target_dir).toBe("/home/user/.claude");

    expect(loaded.environments["ssh-test"]).toBeDefined();
    const sshEnv = loaded.environments["ssh-test"];
    expect(sshEnv.type).toBe("ssh");
    expect(sshEnv.host).toBe("testhost");
  });

  test("getTarget", () => {
    const config = sampleConfig();
    expect(getTarget(config, "claude")).toBeDefined();
    expect(getTarget(config, "claude")!.name).toBe("claude");
    expect(getTarget(config, "nonexistent")).toBeUndefined();
  });

  test("getEnvironment", () => {
    const config = sampleConfig();
    expect(getEnvironment(config, "docker-test")).toBeDefined();
    expect(getEnvironment(config, "nonexistent")).toBeUndefined();
  });

  test("localPath resolves tilde", () => {
    const target = {
      name: "test",
      profile: "test",
      repo: "git@example.com:test.git",
      local_dir: "~/.test",
      sync_paths: [],
    };
    const lp = localPath(target);
    expect(path.isAbsolute(lp)).toBe(true);
    expect(lp.endsWith(".test")).toBe(true);
  });

  test("save creates parent dirs", () => {
    const configPath = path.join(tmpDir(), "deep", "nested", "config.json");
    const config: Config = { version: 1, targets: [], environments: {} };
    saveConfig(config, configPath);
    expect(fs.existsSync(configPath)).toBe(true);
  });

  test("git_env not saved when empty", () => {
    const configPath = path.join(tmpDir(), "config.json");
    const config: Config = {
      version: 1,
      targets: [
        {
          name: "test",
          profile: "test",
          repo: "git@example.com:test.git",
          local_dir: "~/.test",
          sync_paths: ["file.md"],
        },
      ],
      environments: {},
    };
    saveConfig(config, configPath);
    const data = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(data.targets[0].git_env).toBeUndefined();
  });
});
