#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { pushCommand } from "./commands/push.js";
import { pullCommand } from "./commands/pull.js";
import { installCommand } from "./commands/install.js";
import { diffCommand } from "./commands/diff.js";
import { listProfilesCommand } from "./commands/list-profiles.js";

const VERSION = "0.1.0";

const program = new Command();
program
  .name("kitchen-sync")
  .description("Sync AI coding tool configs across environments")
  .version(VERSION, "-V, --version", "Output the version number")
  .option("-v, --verbose", "Verbose output");

program.addCommand(initCommand);
program.addCommand(statusCommand);
program.addCommand(pushCommand);
program.addCommand(pullCommand);
program.addCommand(installCommand);
program.addCommand(diffCommand);
program.addCommand(listProfilesCommand);

program.parse();
