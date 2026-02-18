export interface Profile {
  local_dir: string;
  sync_paths: string[];
}

export const PROFILES: Record<string, Profile> = {
  claude: {
    local_dir: "~/.claude",
    sync_paths: [
      "CLAUDE.md",
      "settings.json",
      "agents",
      "commands",
      "skills",
      "scripts",
    ],
  },
  // Future profiles:
  // cursor: { local_dir: "~/.cursor", sync_paths: [...] },
  // windsurf: { local_dir: "~/.windsurf", sync_paths: [...] },
  // aider: { local_dir: "~/.aider", sync_paths: [...] },
};

export function getProfile(name: string): Profile | undefined {
  return PROFILES[name];
}

export function listProfiles(): Record<string, Profile> {
  return { ...PROFILES };
}
