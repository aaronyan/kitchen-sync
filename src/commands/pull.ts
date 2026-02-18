import { Command } from "commander";
import * as fs from "fs";
import { loadConfig, getTarget, localPath } from "../config.js";
import { gitPull } from "../sync.js";
import { info, warn, error, heading, blank, cmd, sanitizeUrls } from "../ui.js";

export const pullCommand = new Command("pull")
  .description("Pull latest from remote")
  .option("--dry-run", "Show what would change")
  .option("-t, --target <name>", "Pull a specific target only")
  .action((opts) => {
    const config = loadConfig();
    if (config.targets.length === 0) {
      warn(`No targets configured. Run: ${cmd("kitchen-sync init")}`);
      return;
    }

    let targets = config.targets;
    if (opts.target) {
      const t = getTarget(config, opts.target);
      if (!t) {
        error(`Target '${opts.target}' not found.`);
        return;
      }
      targets = [t];
    }

    blank();

    for (const target of targets) {
      heading(`Pulling ${target.name}...`);

      const lp = localPath(target);
      if (!fs.existsSync(lp)) {
        warn(`  Directory not found: ${target.local_dir}`);
        continue;
      }

      try {
        const output = gitPull(lp, target.git_env, opts.dryRun);
        info(`  ${output}`);
      } catch (e: any) {
        error(`  Pull failed: ${sanitizeUrls(e.message ?? String(e))}`);
      }
    }

    blank();
  });
