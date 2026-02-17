"""Tests for config loading and saving."""

from kitchen_sync.config import (
    Config,
    EnvironmentConfig,
    EnvTargetConfig,
    TargetConfig,
    load_config,
    save_config,
)


class TestConfig:
    def test_load_missing_file(self, tmp_path):
        path = tmp_path / "nonexistent.json"
        config = load_config(path)
        assert config.version == 1
        assert config.targets == []
        assert config.environments == {}

    def test_save_and_load_roundtrip(self, tmp_config, sample_config):
        save_config(sample_config, tmp_config)
        loaded = load_config(tmp_config)

        assert loaded.version == 1
        assert len(loaded.targets) == 1
        assert loaded.targets[0].name == "claude"
        assert loaded.targets[0].repo == "git@example.com:user/dot-claude.git"
        assert loaded.targets[0].sync_paths == [
            "CLAUDE.md",
            "settings.json",
            "commands",
        ]
        assert loaded.targets[0].git_env == {
            "HTTPS_PROXY": "socks5://127.0.0.1:8080"
        }

    def test_environment_roundtrip(self, tmp_config, sample_config):
        save_config(sample_config, tmp_config)
        loaded = load_config(tmp_config)

        assert "docker-test" in loaded.environments
        docker_env = loaded.environments["docker-test"]
        assert docker_env.type == "docker"
        assert docker_env.image == "test-image:latest"
        assert "claude" in docker_env.targets
        assert docker_env.targets["claude"].target_dir == "/home/user/.claude"
        assert docker_env.targets["claude"].resolve_symlinks is True

        assert "ssh-test" in loaded.environments
        ssh_env = loaded.environments["ssh-test"]
        assert ssh_env.type == "ssh"
        assert ssh_env.host == "testhost"

    def test_get_target(self, sample_config):
        assert sample_config.get_target("claude") is not None
        assert sample_config.get_target("claude").name == "claude"
        assert sample_config.get_target("nonexistent") is None

    def test_get_environment(self, sample_config):
        assert sample_config.get_environment("docker-test") is not None
        assert sample_config.get_environment("nonexistent") is None

    def test_local_path(self):
        target = TargetConfig(
            name="test",
            profile="test",
            repo="git@example.com:test.git",
            local_dir="~/.test",
            sync_paths=[],
        )
        assert target.local_path.is_absolute()
        assert str(target.local_path).endswith(".test")

    def test_save_creates_parent_dirs(self, tmp_path):
        path = tmp_path / "deep" / "nested" / "config.json"
        config = Config()
        save_config(config, path)
        assert path.exists()

    def test_git_env_not_saved_when_empty(self, tmp_config):
        config = Config(
            targets=[
                TargetConfig(
                    name="test",
                    profile="test",
                    repo="git@example.com:test.git",
                    local_dir="~/.test",
                    sync_paths=["file.md"],
                )
            ]
        )
        save_config(config, tmp_config)
        import json

        data = json.loads(tmp_config.read_text())
        assert "git_env" not in data["targets"][0]
