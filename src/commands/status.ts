import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { loadConfig, localPath } from "../config.js";
import { gitStatusForPaths } from "../sync.js";
import { info, warn, heading, styled, blank, cmd } from "../ui.js";

export const statusCommand = new Command("status")
  .description("Show uncommitted changes in sync paths and ahead/behind remote")
  .action(() => {
    const config = loadConfig();
    if (config.targets.length === 0) {
      warn(`No targets configured. Run: ${cmd("kitchen-sync init")}`);
      return;
    }

    blank();
    info("Checking the pantry...");
    blank();

    for (const target of config.targets) {
      heading(`${target.name} (${target.local_dir})`);

      const lp = localPath(target);
      if (!fs.existsSync(lp)) {
        warn(`  Directory not found: ${target.local_dir}`);
        continue;
      }

      const gitDir = path.join(lp, ".git");
      if (!fs.existsSync(gitDir)) {
        warn("  Not a git repository.");
        continue;
      }

      const status = gitStatusForPaths(lp, target.sync_paths, target.git_env);

      if (status.modified.length > 0) {
        info(`  ${status.modified.length} file(s) simmering (uncommitted changes):`);
        for (const m of status.modified) {
          info(`    ${styled(m, { color: "yellow" })}`);
        }
      } else {
        info("  All ingredients fresh.");
      }

      if (status.ahead > 0) {
        info(`  ${status.ahead} commit(s) ahead of remote (ready to serve)`);
      }
      if (status.behind > 0) {
        info(`  ${status.behind} commit(s) behind remote (needs a pull)`);
      }
      if (status.modified.length === 0 && status.ahead === 0 && status.behind === 0) {
        info("  Nothing to sync.");
      }
    }

    blank();
  });
