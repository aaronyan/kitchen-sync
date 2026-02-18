import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import * as clack from "@clack/prompts";
import { loadConfig, getTarget, getEnvironment, localPath } from "../config.js";
import { createAdapter } from "../adapters/index.js";
import { prepareStaging } from "../sync.js";
import { info, warn, error, success, heading, blank } from "../ui.js";

export const installCommand = new Command("install")
  .description("Deploy configs to a named environment")
  .argument("<env-name>", "Environment name")
  .option("--dry-run", "Show what would be deployed")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (envName: string, opts) => {
    const config = loadConfig();
    const envConfig = getEnvironment(config, envName);
    if (!envConfig) {
      error(`Environment '${envName}' not found in config.`);
      const envNames = Object.keys(config.environments);
      info(`Available: ${envNames.join(", ") || "(none)"}`);
      return;
    }

    blank();

    const adapterConf: { type: string; image?: string; host?: string } = { type: envConfig.type };
    if (envConfig.image) adapterConf.image = envConfig.image;
    if (envConfig.host) adapterConf.host = envConfig.host;

    const adapter = createAdapter(adapterConf);

    info(`Finding the kitchen... (${envName})`);

    if (!adapter.isAvailable()) {
      error("  No kitchen found!");
      if (envConfig.type === "docker") {
        info(`  Tip: Start the container for ${envConfig.image}, then try again.`);
      } else if (envConfig.type === "ssh") {
        info(`  Tip: Check SSH connectivity to ${envConfig.host}.`);
      }
      return;
    }

    success(`  Connected to ${adapter.displayName}`);
    blank();

    for (const [targetName, envTarget] of Object.entries(envConfig.targets)) {
      const target = getTarget(config, targetName);
      if (!target) {
        warn(`  Target '${targetName}' not found in config, skipping.`);
        continue;
      }

      heading(`Plating ${target.name} to ${envTarget.target_dir}`);

      const lp = localPath(target);
      if (!fs.existsSync(lp)) {
        warn(`  Source not found: ${target.local_dir}`);
        continue;
      }

      const resolveSymlinks = envTarget.resolve_symlinks !== false;
      const staging = prepareStaging(lp, target.sync_paths, resolveSymlinks);

      // Count resolved symlinks
      const symlinkCount = countResolvedSymlinks(lp, target.sync_paths);

      // Show what's being deployed
      const garnish = target.sync_paths.filter((sp) =>
        fs.existsSync(path.join(staging, sp)),
      );
      if (garnish.length > 0) {
        info(`  Garnishing: ${garnish.join(", ")}`);
      } else {
        info("  Nothing to plate (no matching files).");
        fs.rmSync(staging, { recursive: true, force: true });
        continue;
      }

      if (symlinkCount > 0) {
        info(`  Resolved ${symlinkCount} symlink(s)`);
      }

      if (opts.dryRun) {
        info("  (dry-run) Would deploy the above.");
        fs.rmSync(staging, { recursive: true, force: true });
        continue;
      }

      if (!opts.yes) {
        blank();
        warn(`  This will delete and replace on ${adapter.displayName}:`);
        for (const sp of garnish) {
          info(`    ${envTarget.target_dir}/${sp}`);
        }
        blank();
        const confirmed = await clack.confirm({
          message: "Proceed with install?",
          initialValue: true,
        });
        if (clack.isCancel(confirmed) || !confirmed) {
          info("  Skipped.");
          fs.rmSync(staging, { recursive: true, force: true });
          continue;
        }
      }

      adapter.clean(envTarget.target_dir, target.sync_paths);
      adapter.deploy(staging, envTarget.target_dir, target.sync_paths);
      fs.rmSync(staging, { recursive: true, force: true });
    }

    blank();
    if (!opts.dryRun) {
      success(`  Order up! ${envName} is served.`);
    }
    blank();
  });

function countResolvedSymlinks(sourceDir: string, syncPaths: string[]): number {
  let count = 0;
  for (const sp of syncPaths) {
    const src = path.join(sourceDir, sp);
    if (!fs.existsSync(src)) continue;

    const stat = fs.lstatSync(src);
    if (stat.isSymbolicLink()) {
      count++;
    } else if (stat.isDirectory()) {
      countSymlinksInDir(src, (n) => { count += n; });
    }
  }
  return count;
}

function countSymlinksInDir(dir: string, add: (n: number) => void): void {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) {
      add(1);
    } else if (stat.isDirectory()) {
      countSymlinksInDir(full, add);
    }
  }
}
