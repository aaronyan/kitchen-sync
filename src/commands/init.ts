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

    // Look up existing target and environments for defaults
    const existing = getTarget(config, profileName);
    const existingDockerEnv = Object.values(config.environments).find((e) => e.type === "docker");
    const existingSshEnv = Object.values(config.environments).find((e) => e.type === "ssh");

    // Repo URL
    const repoDefault = existing?.repo ?? "git@github.com:you/dot-claude.git";
    const repo = await clack.text({
      message: "Git repo URL",
      placeholder: repoDefault,
      defaultValue: existing?.repo,
      validate: (v) => {
        if (!v.trim()) return "Repo URL is required";
      },
    });

    if (clack.isCancel(repo)) {
      clack.cancel("Setup cancelled.");
      process.exit(0);
    }

    // Check for existing target
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
    const existingProxy = existing?.git_env?.HTTPS_PROXY;
    const needsProxy = await clack.confirm({
      message: "Does the git repo need proxy settings?",
      initialValue: !!existingProxy,
    });

    if (clack.isCancel(needsProxy)) {
      clack.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (needsProxy) {
      const proxyDefault = existingProxy ?? "socks5://127.0.0.1:8080";
      const proxy = await clack.text({
        message: "HTTPS_PROXY",
        placeholder: proxyDefault,
        defaultValue: existingProxy,
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
      initialValue: !!existingDockerEnv,
    });

    if (clack.isCancel(addDocker)) {
      clack.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (addDocker) {
      const existingDockerTarget = existingDockerEnv?.targets[profileName];
      const defaultTargetDir = `/home/remote-user/${profile.local_dir.split("/").pop()}`;

      const dockerGroup = await clack.group({
        envName: () =>
          clack.text({
            message: "Environment name",
            placeholder: existingDockerEnv?.name ?? "my-container",
            defaultValue: existingDockerEnv?.name,
          }),
        image: () =>
          clack.text({
            message: "Docker image",
            placeholder: existingDockerEnv?.image ?? "ubuntu:latest",
            defaultValue: existingDockerEnv?.image,
          }),
        targetDir: () =>
          clack.text({
            message: "Target directory in container",
            placeholder: existingDockerTarget?.target_dir ?? defaultTargetDir,
            defaultValue: existingDockerTarget?.target_dir,
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
      initialValue: !!existingSshEnv,
    });

    if (clack.isCancel(addSsh)) {
      clack.cancel("Setup cancelled.");
      process.exit(0);
    }

    if (addSsh) {
      const existingSshTarget = existingSshEnv?.targets[profileName];
      const defaultTargetDir = `~/${profile.local_dir.split("/").pop()}`;

      const sshGroup = await clack.group({
        envName: () =>
          clack.text({
            message: "Environment name",
            placeholder: existingSshEnv?.name ?? "my-server",
            defaultValue: existingSshEnv?.name,
          }),
        host: () =>
          clack.text({
            message: "SSH host",
            placeholder: existingSshEnv?.host ?? "my-server",
            defaultValue: existingSshEnv?.host,
          }),
        targetDir: () =>
          clack.text({
            message: "Target directory on host",
            placeholder: existingSshTarget?.target_dir ?? defaultTargetDir,
            defaultValue: existingSshTarget?.target_dir,
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
