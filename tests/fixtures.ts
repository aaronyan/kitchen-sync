import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { Config } from "../src/config.js";

export function createTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ksync-test-"));
}

export function sampleConfig(): Config {
  return {
    version: 1,
    targets: [
      {
        name: "claude",
        profile: "claude",
        repo: "git@example.com:user/dot-claude.git",
        local_dir: "~/.claude",
        sync_paths: ["CLAUDE.md", "settings.json", "commands"],
        git_env: { HTTPS_PROXY: "socks5://127.0.0.1:8080" },
      },
    ],
    environments: {
      "docker-test": {
        name: "docker-test",
        type: "docker",
        image: "test-image:latest",
        targets: {
          claude: {
            target_dir: "/home/user/.claude",
            resolve_symlinks: true,
          },
        },
      },
      "ssh-test": {
        name: "ssh-test",
        type: "ssh",
        host: "testhost",
        targets: {
          claude: {
            target_dir: "/home/user/.claude",
            resolve_symlinks: true,
          },
        },
      },
    },
  };
}

export function createMockSourceDir(tmpDir: string): string {
  const source = path.join(tmpDir, "source");
  fs.mkdirSync(source);

  // Regular file
  fs.writeFileSync(path.join(source, "CLAUDE.md"), "# My Config\n");

  // Regular file
  fs.writeFileSync(path.join(source, "settings.json"), '{"key": "value"}\n');

  // Directory with files
  const commands = path.join(source, "commands");
  fs.mkdirSync(commands);
  fs.writeFileSync(path.join(commands, "commit.md"), "commit instructions\n");
  fs.writeFileSync(path.join(commands, "review.md"), "review instructions\n");

  // Directory with a symlink
  const skills = path.join(source, "skills");
  fs.mkdirSync(skills);
  fs.writeFileSync(path.join(skills, "local-skill.md"), "local skill content\n");

  // Create a target that the symlink will point to
  const external = path.join(tmpDir, "external");
  fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, "ext-skill.md"), "external skill content\n");
  fs.symlinkSync(external, path.join(skills, "ext-skill"));

  return source;
}
