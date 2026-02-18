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

/** If an existing value is set, pre-fill the input; otherwise show a greyed-out placeholder. */
function textDefaults(existing: string | undefined, fallback: string) {
  return existing
    ? { initialValue: existing }
    : { placeholder: fallback };
}

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
    const repo = await clack.text({
      message: "Git repo URL",
      ...textDefaults(existing?.repo, "git@github.com:you/dot-claude.git"),
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
      const proxy = await clack.text({
        message: "HTTPS_PROXY",
        ...textDefaults(existingProxy, "socks5://127.0.0.1:8080"),
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
            ...textDefaults(existingDockerEnv?.name, "my-container"),
          }),
        image: () =>
          clack.text({
            message: "Docker image",
            ...textDefaults(existingDockerEnv?.image, "ubuntu:latest"),
          }),
        targetDir: () =>
          clack.text({
            message: "Target directory in container",
            ...textDefaults(existingDockerTarget?.target_dir, defaultTargetDir),
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
            ...textDefaults(existingSshEnv?.name, "my-server"),
          }),
        host: () =>
          clack.text({
            message: "SSH host",
            ...textDefaults(existingSshEnv?.host, "my-server"),
          }),
        targetDir: () =>
          clack.text({
            message: "Target directory on host",
            ...textDefaults(existingSshTarget?.target_dir, defaultTargetDir),
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

    const envNames = Object.keys(config.environments);
    const nextSteps = [
      `${cmd("kitchen-sync status")}         — see what's in sync`,
      `${cmd("kitchen-sync list envs")}      — view configured environments`,
      ...(envNames.length > 0
        ? [`${cmd(`kitchen-sync install ${envNames[0]}`)}  — push configs to an environment`]
        : []),
    ];

    clack.outro(`Config saved. Next steps:\n\n${nextSteps.join("\n")}`);
  });
