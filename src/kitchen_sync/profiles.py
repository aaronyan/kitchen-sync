"""Built-in platform profiles for common AI coding tools."""

PROFILES = {
    "claude": {
        "local_dir": "~/.claude",
        "sync_paths": [
            "CLAUDE.md",
            "settings.json",
            "agents",
            "commands",
            "skills",
            "scripts",
        ],
    },
    # Future profiles:
    # "cursor": { "local_dir": "~/.cursor", "sync_paths": [...] },
    # "windsurf": { "local_dir": "~/.windsurf", "sync_paths": [...] },
    # "aider": { "local_dir": "~/.aider", "sync_paths": [...] },
}


def get_profile(name: str) -> dict | None:
    """Get a built-in profile by name, or None if not found."""
    return PROFILES.get(name)


def list_profiles() -> dict:
    """Return all available profiles."""
    return dict(PROFILES)
