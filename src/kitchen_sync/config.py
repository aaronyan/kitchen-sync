"""Configuration management for kitchen-sync."""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

CONFIG_DIR = Path.home() / ".config" / "kitchen-sync"
CONFIG_FILE = CONFIG_DIR / "config.json"
CONFIG_VERSION = 1


@dataclass
class TargetConfig:
    """A syncable config directory backed by a git repo."""

    name: str
    profile: str
    repo: str
    local_dir: str
    sync_paths: list[str] = field(default_factory=list)
    git_env: dict[str, str] = field(default_factory=dict)

    @property
    def local_path(self) -> Path:
        return Path(self.local_dir).expanduser()


@dataclass
class EnvTargetConfig:
    """Per-target settings within an environment."""

    target_dir: str
    resolve_symlinks: bool = True

    @property
    def target_path(self) -> Path:
        return Path(self.target_dir)


@dataclass
class EnvironmentConfig:
    """A remote environment (docker container, ssh host, etc.)."""

    name: str
    type: str
    targets: dict[str, EnvTargetConfig] = field(default_factory=dict)
    # Docker-specific
    image: str | None = None
    # SSH-specific
    host: str | None = None


@dataclass
class Config:
    """Root configuration object."""

    version: int = CONFIG_VERSION
    targets: list[TargetConfig] = field(default_factory=list)
    environments: dict[str, EnvironmentConfig] = field(default_factory=dict)

    def get_target(self, name: str) -> TargetConfig | None:
        for t in self.targets:
            if t.name == name:
                return t
        return None

    def get_environment(self, name: str) -> EnvironmentConfig | None:
        return self.environments.get(name)


def _env_target_from_dict(d: dict) -> EnvTargetConfig:
    return EnvTargetConfig(
        target_dir=d["target_dir"],
        resolve_symlinks=d.get("resolve_symlinks", True),
    )


def _environment_from_dict(name: str, d: dict) -> EnvironmentConfig:
    targets = {}
    for tname, tconf in d.get("targets", {}).items():
        targets[tname] = _env_target_from_dict(tconf)
    return EnvironmentConfig(
        name=name,
        type=d["type"],
        targets=targets,
        image=d.get("image"),
        host=d.get("host"),
    )


def load_config(path: Path | None = None) -> Config:
    """Load config from disk. Returns empty Config if file doesn't exist."""
    path = path or CONFIG_FILE
    if not path.exists():
        return Config()

    data = json.loads(path.read_text())

    targets = []
    for t in data.get("targets", []):
        targets.append(
            TargetConfig(
                name=t["name"],
                profile=t["profile"],
                repo=t["repo"],
                local_dir=t["local_dir"],
                sync_paths=t.get("sync_paths", []),
                git_env=t.get("git_env", {}),
            )
        )

    environments = {}
    for ename, econf in data.get("environments", {}).items():
        environments[ename] = _environment_from_dict(ename, econf)

    return Config(
        version=data.get("version", CONFIG_VERSION),
        targets=targets,
        environments=environments,
    )


def save_config(config: Config, path: Path | None = None) -> None:
    """Save config to disk."""
    path = path or CONFIG_FILE
    path.parent.mkdir(parents=True, exist_ok=True)

    data: dict[str, Any] = {"version": config.version, "targets": [], "environments": {}}

    for t in config.targets:
        td: dict[str, Any] = {
            "name": t.name,
            "profile": t.profile,
            "repo": t.repo,
            "local_dir": t.local_dir,
            "sync_paths": t.sync_paths,
        }
        if t.git_env:
            td["git_env"] = t.git_env
        data["targets"].append(td)

    for ename, env in config.environments.items():
        ed: dict[str, Any] = {"type": env.type, "targets": {}}
        if env.image:
            ed["image"] = env.image
        if env.host:
            ed["host"] = env.host
        for tname, tconf in env.targets.items():
            etd: dict[str, Any] = {"target_dir": tconf.target_dir}
            if tconf.resolve_symlinks is not True:
                etd["resolve_symlinks"] = tconf.resolve_symlinks
            ed["targets"][tname] = etd
        data["environments"][ename] = ed

    path.write_text(json.dumps(data, indent=2) + "\n")
