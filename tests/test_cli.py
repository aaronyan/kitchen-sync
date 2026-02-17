"""Tests for the CLI interface."""

import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from click.testing import CliRunner

from kitchen_sync.cli import cli
from kitchen_sync.config import (
    Config,
    EnvironmentConfig,
    EnvTargetConfig,
    TargetConfig,
    save_config,
)


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def config_with_target(tmp_path):
    """Create a config file and a fake local dir with git repo."""
    config_path = tmp_path / "config.json"
    local_dir = tmp_path / "dot-claude"
    local_dir.mkdir()

    config = Config(
        targets=[
            TargetConfig(
                name="claude",
                profile="claude",
                repo="git@example.com:user/dot-claude.git",
                local_dir=str(local_dir),
                sync_paths=["CLAUDE.md", "commands"],
            )
        ]
    )
    save_config(config, config_path)
    return config_path, local_dir


class TestVersion:
    def test_version_flag(self, runner):
        result = runner.invoke(cli, ["--version"])
        assert result.exit_code == 0
        assert "kitchen-sync" in result.output


class TestListProfiles:
    def test_lists_claude_profile(self, runner):
        result = runner.invoke(cli, ["list-profiles"])
        assert result.exit_code == 0
        assert "claude" in result.output
        assert "~/.claude" in result.output


class TestStatus:
    @patch("kitchen_sync.cli.load_config")
    def test_no_targets(self, mock_load, runner):
        mock_load.return_value = Config()
        result = runner.invoke(cli, ["status"])
        assert "No targets configured" in result.output

    @patch("kitchen_sync.cli.git_status_for_paths")
    @patch("kitchen_sync.cli.load_config")
    def test_shows_modified_files(self, mock_load, mock_status, runner, tmp_path):
        local_dir = tmp_path / "dot-claude"
        local_dir.mkdir()
        (local_dir / ".git").mkdir()

        mock_load.return_value = Config(
            targets=[
                TargetConfig(
                    name="claude",
                    profile="claude",
                    repo="git@example.com:test.git",
                    local_dir=str(local_dir),
                    sync_paths=["CLAUDE.md"],
                )
            ]
        )
        mock_status.return_value = {
            "modified": ["M CLAUDE.md"],
            "ahead": 1,
            "behind": 0,
        }

        result = runner.invoke(cli, ["status"])
        assert "simmering" in result.output
        assert "ahead" in result.output


class TestPush:
    @patch("kitchen_sync.cli.git_push")
    @patch("kitchen_sync.cli.load_config")
    def test_push_dry_run(self, mock_load, mock_push, runner, tmp_path):
        local_dir = tmp_path / "dot-claude"
        local_dir.mkdir()

        mock_load.return_value = Config(
            targets=[
                TargetConfig(
                    name="claude",
                    profile="claude",
                    repo="git@example.com:test.git",
                    local_dir=str(local_dir),
                    sync_paths=["CLAUDE.md"],
                )
            ]
        )
        mock_push.return_value = {
            "commit_hash": "(dry-run)",
            "files_staged": ["CLAUDE.md"],
        }

        result = runner.invoke(cli, ["push", "--dry-run"])
        assert "dry-run" in result.output
        assert "CLAUDE.md" in result.output

    @patch("kitchen_sync.cli.load_config")
    def test_push_no_targets(self, mock_load, runner):
        mock_load.return_value = Config()
        result = runner.invoke(cli, ["push"])
        assert "No targets configured" in result.output


class TestInstall:
    @patch("kitchen_sync.cli.create_adapter")
    @patch("kitchen_sync.cli.load_config")
    def test_install_env_not_found(self, mock_load, mock_adapter, runner):
        mock_load.return_value = Config()
        result = runner.invoke(cli, ["install", "nonexistent"])
        assert "not found" in result.output

    @patch("kitchen_sync.cli.create_adapter")
    @patch("kitchen_sync.cli.load_config")
    def test_install_unavailable(self, mock_load, mock_adapter, runner, tmp_path):
        local_dir = tmp_path / "dot-claude"
        local_dir.mkdir()

        mock_load.return_value = Config(
            targets=[
                TargetConfig(
                    name="claude",
                    profile="claude",
                    repo="git@example.com:test.git",
                    local_dir=str(local_dir),
                    sync_paths=["CLAUDE.md"],
                )
            ],
            environments={
                "docker-test": EnvironmentConfig(
                    name="docker-test",
                    type="docker",
                    image="test:latest",
                    targets={
                        "claude": EnvTargetConfig(
                            target_dir="/home/user/.claude"
                        )
                    },
                )
            },
        )

        mock_adapter_instance = MagicMock()
        mock_adapter_instance.is_available.return_value = False
        mock_adapter.return_value = mock_adapter_instance

        result = runner.invoke(cli, ["install", "docker-test"])
        assert "No kitchen found" in result.output


class TestDiff:
    @patch("kitchen_sync.cli.load_config")
    def test_diff_env_not_found(self, mock_load, runner):
        mock_load.return_value = Config()
        result = runner.invoke(cli, ["diff", "nonexistent"])
        assert "not found" in result.output
