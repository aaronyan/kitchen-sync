"""Shared test fixtures."""

import json
from pathlib import Path

import pytest

from kitchen_sync.config import Config, EnvironmentConfig, EnvTargetConfig, TargetConfig


@pytest.fixture
def tmp_config(tmp_path):
    """Return a path for a temporary config file."""
    return tmp_path / "config.json"


@pytest.fixture
def sample_config():
    """Return a sample Config object."""
    return Config(
        targets=[
            TargetConfig(
                name="claude",
                profile="claude",
                repo="git@example.com:user/dot-claude.git",
                local_dir="~/.claude",
                sync_paths=["CLAUDE.md", "settings.json", "commands"],
                git_env={"HTTPS_PROXY": "socks5://127.0.0.1:8080"},
            ),
        ],
        environments={
            "docker-test": EnvironmentConfig(
                name="docker-test",
                type="docker",
                image="test-image:latest",
                targets={
                    "claude": EnvTargetConfig(
                        target_dir="/home/user/.claude",
                        resolve_symlinks=True,
                    )
                },
            ),
            "ssh-test": EnvironmentConfig(
                name="ssh-test",
                type="ssh",
                host="testhost",
                targets={
                    "claude": EnvTargetConfig(
                        target_dir="/home/user/.claude",
                        resolve_symlinks=True,
                    )
                },
            ),
        },
    )


@pytest.fixture
def mock_source_dir(tmp_path):
    """Create a mock source directory with files and symlinks."""
    source = tmp_path / "source"
    source.mkdir()

    # Regular file
    (source / "CLAUDE.md").write_text("# My Config\n")

    # Regular file
    (source / "settings.json").write_text('{"key": "value"}\n')

    # Directory with files
    commands = source / "commands"
    commands.mkdir()
    (commands / "commit.md").write_text("commit instructions\n")
    (commands / "review.md").write_text("review instructions\n")

    # Directory with a symlink
    skills = source / "skills"
    skills.mkdir()
    (skills / "local-skill.md").write_text("local skill content\n")

    # Create a target that the symlink will point to
    external = tmp_path / "external"
    external.mkdir()
    (external / "ext-skill.md").write_text("external skill content\n")
    (skills / "ext-skill").symlink_to(external)

    return source
