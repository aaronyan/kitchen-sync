import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export const CONFIG_DIR = path.join(os.homedir(), ".config", "kitchen-sync");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
export const CONFIG_VERSION = 1;

export interface TargetConfig {
  name: string;
  profile: string;
  repo: string;
  local_dir: string;
  sync_paths: string[];
  git_env?: Record<string, string>;
}

export interface EnvTargetConfig {
  target_dir: string;
  resolve_symlinks?: boolean;
}

export interface EnvironmentConfig {
  name: string;
  type: string;
  targets: Record<string, EnvTargetConfig>;
  image?: string;
  host?: string;
}

export interface Config {
  version: number;
  targets: TargetConfig[];
  environments: Record<string, EnvironmentConfig>;
}

export function validateSyncPath(p: string): void {
  if (/\0/.test(p)) throw new Error(`Invalid sync path (null byte): ${p}`);
  if (path.isAbsolute(p)) throw new Error(`Invalid sync path (absolute): ${p}`);
  const normalized = path.normalize(p);
  if (normalized.startsWith("..")) throw new Error(`Invalid sync path (traversal): ${p}`);
}

export function localPath(target: TargetConfig): string {
  const dir = target.local_dir.replace(/^~/, os.homedir());
  return path.resolve(dir);
}

export function getTarget(config: Config, name: string): TargetConfig | undefined {
  return config.targets.find((t) => t.name === name);
}

export function getEnvironment(config: Config, name: string): EnvironmentConfig | undefined {
  return config.environments[name];
}

export function loadConfig(configPath?: string): Config {
  const p = configPath ?? CONFIG_FILE;
  if (!fs.existsSync(p)) {
    return { version: CONFIG_VERSION, targets: [], environments: {} };
  }

  const data = JSON.parse(fs.readFileSync(p, "utf-8"));

  const targets: TargetConfig[] = (data.targets ?? []).map((t: any) => {
    const syncPaths: string[] = t.sync_paths ?? [];
    for (const sp of syncPaths) validateSyncPath(sp);
    return {
      name: t.name,
      profile: t.profile,
      repo: t.repo,
      local_dir: t.local_dir,
      sync_paths: syncPaths,
      ...(t.git_env && Object.keys(t.git_env).length > 0 ? { git_env: t.git_env } : {}),
    };
  });

  const environments: Record<string, EnvironmentConfig> = {};
  for (const [ename, econf] of Object.entries(data.environments ?? {})) {
    const ec = econf as any;
    const envTargets: Record<string, EnvTargetConfig> = {};
    for (const [tname, tconf] of Object.entries(ec.targets ?? {})) {
      const tc = tconf as any;
      envTargets[tname] = {
        target_dir: tc.target_dir,
        ...(tc.resolve_symlinks !== undefined ? { resolve_symlinks: tc.resolve_symlinks } : {}),
      };
    }
    environments[ename] = {
      name: ename,
      type: ec.type,
      targets: envTargets,
      ...(ec.image ? { image: ec.image } : {}),
      ...(ec.host ? { host: ec.host } : {}),
    };
  }

  return { version: data.version ?? CONFIG_VERSION, targets, environments };
}

export function saveConfig(config: Config, configPath?: string): void {
  const p = configPath ?? CONFIG_FILE;
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });

  const data: any = {
    version: config.version,
    targets: config.targets.map((t) => {
      const td: any = {
        name: t.name,
        profile: t.profile,
        repo: t.repo,
        local_dir: t.local_dir,
        sync_paths: t.sync_paths,
      };
      if (t.git_env && Object.keys(t.git_env).length > 0) {
        td.git_env = t.git_env;
      }
      return td;
    }),
    environments: {} as Record<string, any>,
  };

  for (const [ename, env] of Object.entries(config.environments)) {
    const ed: any = { type: env.type, targets: {} };
    if (env.image) ed.image = env.image;
    if (env.host) ed.host = env.host;
    for (const [tname, tconf] of Object.entries(env.targets)) {
      const etd: any = { target_dir: tconf.target_dir };
      if (tconf.resolve_symlinks !== undefined && tconf.resolve_symlinks !== true) {
        etd.resolve_symlinks = tconf.resolve_symlinks;
      }
      ed.targets[tname] = etd;
    }
    data.environments[ename] = ed;
  }

  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}
