import { Command } from "commander";
import { PROFILES } from "../profiles.js";
import { info, heading, styled, blank } from "../ui.js";

export const listProfilesCommand = new Command("list-profiles")
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
  });
