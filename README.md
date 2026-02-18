# kitchen-sync

Sync your [agentic engineering](https://x.com/karpathy/status/2019137879310836075) configs across environments using git as the backing store.

Keep your settings, agents, commands, and skills in sync across your local machine, Docker containers, and SSH hosts. Works with any agentic coding tool that stores config in a dotfile directory -- Claude Code, Codex CLI, Cursor, Windsurf, and more.

## Install

```bash
bun install -g kitchen-sync
```

Or for development:

```bash
git clone https://github.com/yourusername/kitchen-sync.git
cd kitchen-sync
bun install
```

## Quick Start

```bash
# Set up your first sync target
kitchen-sync init

# Check what's changed
kitchen-sync status

# Push local changes to git
kitchen-sync push -m "update agents"

# Deploy to a remote environment
kitchen-sync install my-container
```

## Commands

| Command | Description |
|---|---|
| `kitchen-sync init` | Interactive setup: pick a profile, set repo URL, register environments |
| `kitchen-sync status` | Show uncommitted changes and ahead/behind remote |
| `kitchen-sync push [-m MSG]` | Stage, commit, and push sync paths to git |
| `kitchen-sync pull` | Pull latest from remote |
| `kitchen-sync install ENV` | Deploy configs to a named environment |
| `kitchen-sync diff ENV` | Show unified diff of local vs remote |
| `kitchen-sync list-profiles` | Show available platform profiles |

All commands support `--dry-run` where applicable. The `ksync` alias is also available.

## How It Works

**Targets** define what to sync -- a local directory (e.g. `~/.claude`) backed by a git repo, with specific paths to track.

**Environments** define where to sync -- Docker containers, SSH hosts, or local paths. Each environment maps targets to remote directories.

**Profiles** are built-in presets for popular agentic coding tools. v1 ships with Claude Code; Codex CLI, Cursor, Windsurf, and Aider profiles are planned.

### Sync Flow

```
Local (~/.claude) --push--> Git repo --pull/install--> Remote environments
```

1. **Edit** configs locally as you normally would
2. **Push** commits changes to your git repo
3. **Install** deploys to Docker/SSH environments, resolving symlinks for portability

### Symlink Resolution

Config directories often use symlinks to share files across tools (e.g. `skills/find-skills -> ../../.agents/skills/find-skills`). When deploying to remote environments, `kitchen-sync` resolves these to actual content so they work without the original symlink targets.

## Config

Stored at `~/.config/kitchen-sync/config.json`:

```json
{
  "version": 1,
  "targets": [
    {
      "name": "claude",
      "profile": "claude",
      "repo": "git@github.com:you/dot-claude.git",
      "local_dir": "~/.claude",
      "sync_paths": ["CLAUDE.md", "settings.json", "agents", "commands", "skills", "scripts"]
    }
  ],
  "environments": {
    "my-docker": {
      "type": "docker",
      "image": "my-image:latest",
      "targets": {
        "claude": { "target_dir": "/home/user/.claude", "resolve_symlinks": true }
      }
    },
    "my-server": {
      "type": "ssh",
      "host": "myserver",
      "targets": {
        "claude": { "target_dir": "/home/user/.claude", "resolve_symlinks": true }
      }
    }
  }
}
```

### Proxy Support

For git repos behind a proxy, add `git_env` to the target:

```json
{
  "name": "claude",
  "git_env": {
    "HTTPS_PROXY": "socks5://127.0.0.1:8080",
    "HTTP_PROXY": "socks5://127.0.0.1:8080"
  }
}
```

## Environment Adapters

| Type | Detection | Deploy Method |
|---|---|---|
| **docker** | `docker ps --filter ancestor=IMAGE` | `docker cp` |
| **ssh** | `ssh -o ConnectTimeout=5 HOST true` | `rsync -avz --delete` |
| **local** | Always available | `fs.cpSync` |

## Profiles

### Claude Code (`claude`)
- Directory: `~/.claude`
- Sync paths: `CLAUDE.md`, `settings.json`, `agents`, `commands`, `skills`, `scripts`

More profiles coming soon (Codex CLI, Cursor, Windsurf, Aider).

## Development

```bash
bun install       # Install dependencies
bun test          # Run tests
bun run build     # Build for distribution
bun run dev       # Run CLI directly via bun
```

## License

MIT
