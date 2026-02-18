import { Command } from "commander";
import * as fs from "fs";
import { loadConfig, getTarget, getEnvironment, localPath } from "../config.js";
import { createAdapter } from "../adapters/index.js";
import { collectFiles, diffTrees } from "../sync.js";
import { info, error, success, heading, blank } from "../ui.js";

export const diffCommand = new Command("diff")
  .description("Show unified diff of local vs remote environment")
  .argument("<env-name>", "Environment name")
  .action((envName: string) => {
    const config = loadConfig();
    const envConfig = getEnvironment(config, envName);
    if (!envConfig) {
      error(`Environment '${envName}' not found in config.`);
      return;
    }

    blank();

    const adapterConf: { type: string; image?: string; host?: string } = { type: envConfig.type };
    if (envConfig.image) adapterConf.image = envConfig.image;
    if (envConfig.host) adapterConf.host = envConfig.host;

    const adapter = createAdapter(adapterConf);

    info(`Tasting ${envName} against local...`);

    if (!adapter.isAvailable()) {
      error(`  Can't reach ${envName}.`);
      return;
    }

    blank();
    let hasDiff = false;

    for (const [targetName, envTarget] of Object.entries(envConfig.targets)) {
      const target = getTarget(config, targetName);
      if (!target) continue;

      heading(target.name);

      const lp = localPath(target);
      const localFiles = collectFiles(lp, target.sync_paths);

      // Collect remote files
      const remoteFiles: Record<string, string> = {};
      for (const sp of target.sync_paths) {
        const remotePath = `${envTarget.target_dir}/${sp}`;
        const filesInPath = adapter.listFiles(remotePath);

        for (const rel of filesInPath) {
          const fullRel = `${sp}/${rel}`;
          const content = adapter.readFile(`${remotePath}/${rel}`);
          if (content !== null) {
            remoteFiles[fullRel] = content;
          }
        }

        // Also try reading as a single file
        const content = adapter.readFile(remotePath);
        if (content !== null && !(sp in remoteFiles)) {
          remoteFiles[sp] = content;
        }
      }

      const diffs = diffTrees(localFiles, remoteFiles);

      if (diffs.length > 0) {
        hasDiff = true;
        for (const d of diffs) {
          console.log(d);
        }
      } else {
        info("  Everything matches.");
      }
    }

    if (!hasDiff) {
      blank();
      success("  Everything matches. Chef's kiss.");
    }
    blank();
  });
