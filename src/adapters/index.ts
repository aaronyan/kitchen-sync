import type { EnvironmentConfig } from "../config.js";
import type { Environment } from "./base.js";
import { DockerEnvironment } from "./docker.js";
import { LocalEnvironment } from "./local.js";
import { SshEnvironment } from "./ssh.js";

export { Environment } from "./base.js";
export { DockerEnvironment } from "./docker.js";
export { LocalEnvironment } from "./local.js";
export { SshEnvironment } from "./ssh.js";

export function createAdapter(envConfig: { type: string; image?: string; host?: string }): Environment {
  switch (envConfig.type) {
    case "docker":
      return new DockerEnvironment(envConfig.image!);
    case "ssh":
      return new SshEnvironment(envConfig.host!);
    case "local":
      return new LocalEnvironment();
    default:
      throw new Error(`Unknown environment type: ${envConfig.type}`);
  }
}
