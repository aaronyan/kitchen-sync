import { Command } from "commander";
import * as fs from "fs";
import { loadConfig, getTarget, localPath } from "../config.js";
import { gitPush } from "../sync.js";
import { info, warn, error, heading, styled, blank, cmd } from "../ui.js";

export const pushCommand = new Command("push")
  .description("Stage sync paths, commit, and push to git")
  .option("-m, --message <msg>", "Commit message")
  .option("--dry-run", "Show what would be committed")
  .option("-t, --target <name>", "Sync a specific target only")
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
      heading(`Prepping ${target.name}...`);

      const lp = localPath(target);
      if (!fs.existsSync(lp)) {
        warn(`  Directory not found: ${target.local_dir}`);
        continue;
      }

      const msg = opts.message ?? "kitchen-sync: update configs";

      const result = gitPush(lp, target.sync_paths, msg, target.git_env, opts.dryRun);

      if (result.files_staged.length === 0) {
        info("  Nothing new to commit. Pantry is clean.");
        continue;
      }

      for (const f of result.files_staged) {
        info(`  Staged: ${styled(f, { color: "cyan" })}`);
      }

      if (opts.dryRun) {
        info("  (dry-run) Would commit and push the above.");
      } else {
        info(`  Cooking up commit: "${msg}"`);
        info(`  Serving to origin... ${styled("done!", { color: "green" })} (${result.commit_hash})`);
      }
    }

    blank();
  });
