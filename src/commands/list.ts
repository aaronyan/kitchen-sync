import { Command } from "commander";
import { PROFILES } from "../profiles.js";
import { loadConfig } from "../config.js";
import { info, heading, styled, blank, warn } from "../ui.js";

export const listCommand = new Command("list")
  .description("List profiles and environments")
  .action(() => {
    listCommand.outputHelp();
  });

listCommand.addCommand(
  new Command("profiles")
    .description("Show available platform profiles")
    .action(() => {
      blank();
      heading("Available profiles");
      blank();

      for (const [name, profile] of Object.entries(PROFILES)) {
        info(styled(name, { bold: true }));
        info(`  Directory: ${profile.local_dir}`);
        info(`  Sync paths: ${profile.sync_paths.join(", ")}`);
        blank();
      }
    })
);

listCommand.addCommand(
  new Command("envs")
    .aliases(["environments"])
    .description("Show configured environments")
    .action(() => {
      const config = loadConfig();
      const envs = Object.entries(config.environments);

      if (envs.length === 0) {
        blank();
        warn("No environments configured.");
        blank();
        return;
      }

      blank();
      heading("Configured environments");
      blank();

      for (const [name, env] of envs) {
        info(styled(name, { bold: true }));
        info(`  Type: ${env.type}`);
        if (env.host) info(`  Host: ${env.host}`);
        if (env.image) info(`  Image: ${env.image}`);
        const targetNames = Object.keys(env.targets);
        if (targetNames.length > 0) {
          info(`  Targets: ${targetNames.join(", ")}`);
        }
        blank();
      }
    })
);
