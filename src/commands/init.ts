import { Command } from "commander";
import * as clack from "@clack/prompts";
import { cmd } from "../ui.js";
import {
  loadConfig,
  saveConfig,
  getTarget,
  CONFIG_FILE,
  type Config,
  type EnvironmentConfig,
  type EnvTargetConfig,
  type TargetConfig,
} from "../config.js";
import { PROFILES } from "../profiles.js";

export const initCommand = new Command("init")
  .description("Interactive setup: pick a profile, set repo URL, register environments")
  .action(async () => {
    clack.intro("kitchen-sync setup");

    const config = loadConfig();
    const profileNames = Object.keys(PROFILES);

    // Pick profile
    const profileChoice = await clack.select({
      message: "What are we syncing?",
      options: profileNames.map((name) => ({
        value: name,
        label: `${name} (${PROFILES[name].local_dir})`,
      })),
    });

    if (clack.isCancel(profileChoice)) {
      clack.cancel("Setup cancelled.");
      process.exit(0);
    }

    const profileName = profileChoice as string;
    const profile = PROFILES[profileName];

    // Repo URL
    const repo = await clack.text({
      message: "Git repo URL",
      placeholder: "git@github.com:you/dot-claude.git",
      validate: (v) => {
        if (!v.trim()) return "Repo URL is required";
      },
    });

    if (clack.isCancel(repo)) {
      clack.cancel("Setup cancelled.");
      process.exit(0);
    }

    // Check for existing target
    const existing = getTarget(config, profileName);
    if (existing) {
      existing.repo = repo as string;
    } else {
      const target: TargetConfig = {
        name: profileName,
        profile: profileName,
        repo: repo as string,
        local_dir: profile.local_dir,
        sync_paths: [...profile.sync_paths],
      };
      config.targets.push(target);
    }

    // Ask about proxy
    const needsProxy = await clack.confirm({
      message: "Does the git repo need proxy settings?",
      initialValue: false,
    });

    if (clack.isCancel(needsProxy)) {
      clack.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (needsProxy) {
      const proxy = await clack.text({
        message: "HTTPS_PROXY",
        initialValue: "socks5://127.0.0.1:8080",
      });

      if (clack.isCancel(proxy)) {
        clack.cancel("Setup cancelled.");
        process.exit(0);
      }

      const t = getTarget(config, profileName);
      if (t) {
        t.git_env = { HTTPS_PROXY: proxy as string, HTTP_PROXY: proxy as string };
      }
    }

    // Ask about Docker environment
    const addDocker = await clack.confirm({
      message: "Add a Docker environment?",
      initialValue: false,
    });

    if (clack.isCancel(addDocker)) {
      clack.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (addDocker) {
      const dockerGroup = await clack.group({
        envName: () =>
          clack.text({ message: "Environment name", initialValue: "my-container" }),
        image: () =>
          clack.text({ message: "Docker image", initialValue: "ubuntu:latest" }),
        targetDir: () =>
          clack.text({
            message: "Target directory in container",
            initialValue: `/home/remote-user/${profile.local_dir.split("/").pop()}`,
          }),
      });

      if (clack.isCancel(dockerGroup)) {
        clack.cancel("Setup cancelled.");
        process.exit(0);
      }

      const env: EnvironmentConfig = {
        name: dockerGroup.envName as string,
        type: "docker",
        image: dockerGroup.image as string,
        targets: {
          [profileName]: {
            target_dir: dockerGroup.targetDir as string,
            resolve_symlinks: true,
          },
        },
      };
      config.environments[dockerGroup.envName as string] = env;
    }

    // Ask about SSH environment
    const addSsh = await clack.confirm({
      message: "Add an SSH environment?",
      initialValue: false,
    });

    if (clack.isCancel(addSsh)) {
      clack.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (addSsh) {
      const sshGroup = await clack.group({
        envName: () =>
          clack.text({ message: "Environment name", initialValue: "my-server" }),
        host: () =>
          clack.text({ message: "SSH host", initialValue: "my-server" }),
        targetDir: () =>
          clack.text({
            message: "Target directory on host",
            initialValue: `~/${profile.local_dir.split("/").pop()}`,
          }),
      });

      if (clack.isCancel(sshGroup)) {
        clack.cancel("Setup cancelled.");
        process.exit(0);
      }

      const env: EnvironmentConfig = {
        name: sshGroup.envName as string,
        type: "ssh",
        host: sshGroup.host as string,
        targets: {
          [profileName]: {
            target_dir: sshGroup.targetDir as string,
            resolve_symlinks: true,
          },
        },
      };
      config.environments[sshGroup.envName as string] = env;
    }

    saveConfig(config);
    clack.outro(`Config saved. Ready to cook! Try: ${cmd("kitchen-sync status")}`);
  });
