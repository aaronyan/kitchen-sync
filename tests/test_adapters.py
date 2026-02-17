"""Tests for environment adapters."""

import subprocess
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from kitchen_sync.adapters import create_adapter
from kitchen_sync.adapters.docker import DockerEnvironment
from kitchen_sync.adapters.local import LocalEnvironment
from kitchen_sync.adapters.ssh import SshEnvironment


class TestCreateAdapter:
    def test_creates_docker_adapter(self):
        adapter = create_adapter({"type": "docker", "image": "test:latest"})
        assert isinstance(adapter, DockerEnvironment)

    def test_creates_ssh_adapter(self):
        adapter = create_adapter({"type": "ssh", "host": "myhost"})
        assert isinstance(adapter, SshEnvironment)

    def test_creates_local_adapter(self):
        adapter = create_adapter({"type": "local"})
        assert isinstance(adapter, LocalEnvironment)

    def test_unknown_type_raises(self):
        with pytest.raises(ValueError, match="Unknown environment type"):
            create_adapter({"type": "ftp"})


class TestLocalEnvironment:
    def test_is_always_available(self):
        adapter = LocalEnvironment()
        assert adapter.is_available() is True

    def test_read_file(self, tmp_path):
        f = tmp_path / "test.txt"
        f.write_text("hello")
        adapter = LocalEnvironment()
        assert adapter.read_file(str(f)) == "hello"

    def test_read_missing_file(self):
        adapter = LocalEnvironment()
        assert adapter.read_file("/nonexistent/path") is None

    def test_list_files(self, tmp_path):
        (tmp_path / "a.txt").write_text("a")
        sub = tmp_path / "sub"
        sub.mkdir()
        (sub / "b.txt").write_text("b")
        adapter = LocalEnvironment()
        files = adapter.list_files(str(tmp_path))
        assert "a.txt" in files
        assert "sub/b.txt" in files

    def test_deploy_and_clean(self, tmp_path):
        # Set up staging
        staging = tmp_path / "staging"
        staging.mkdir()
        (staging / "file.md").write_text("content")
        subdir = staging / "commands"
        subdir.mkdir()
        (subdir / "cmd.md").write_text("cmd content")

        # Deploy
        target = tmp_path / "target"
        adapter = LocalEnvironment()
        deployed = adapter.deploy(staging, str(target), ["file.md", "commands"])
        assert "file.md" in deployed
        assert "commands" in deployed
        assert (target / "file.md").read_text() == "content"
        assert (target / "commands" / "cmd.md").read_text() == "cmd content"

        # Clean
        adapter.clean(str(target), ["file.md", "commands"])
        assert not (target / "file.md").exists()
        assert not (target / "commands").exists()


class TestDockerEnvironment:
    @patch("subprocess.run")
    def test_container_detection(self, mock_run):
        mock_run.return_value = MagicMock(
            stdout="abc123def456\n", returncode=0
        )
        adapter = DockerEnvironment(image="test:latest")
        assert adapter.is_available() is True
        assert adapter.container_id == "abc123def456"

    @patch("subprocess.run")
    def test_no_container(self, mock_run):
        mock_run.return_value = MagicMock(stdout="", returncode=0)
        adapter = DockerEnvironment(image="test:latest")
        assert adapter.is_available() is False

    @patch("subprocess.run")
    def test_read_file(self, mock_run):
        # First call: container detection
        # Second call: docker exec cat
        mock_run.side_effect = [
            MagicMock(stdout="abc123\n", returncode=0),
            MagicMock(stdout="file content", returncode=0),
        ]
        adapter = DockerEnvironment(image="test:latest")
        content = adapter.read_file("/path/to/file")
        assert content == "file content"

    def test_display_name(self):
        adapter = DockerEnvironment(image="test:latest")
        adapter._container_id = "abc123def456"
        assert "abc123def456" in adapter.display_name


class TestSshEnvironment:
    @patch("subprocess.run")
    def test_is_available_success(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        adapter = SshEnvironment(host="testhost")
        assert adapter.is_available() is True

    @patch("subprocess.run")
    def test_is_available_failure(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1)
        adapter = SshEnvironment(host="testhost")
        assert adapter.is_available() is False

    @patch("subprocess.run")
    def test_read_file(self, mock_run):
        mock_run.return_value = MagicMock(
            stdout="file content", returncode=0
        )
        adapter = SshEnvironment(host="testhost")
        content = adapter.read_file("/path/to/file")
        assert content == "file content"

    def test_display_name(self):
        adapter = SshEnvironment(host="myhost")
        assert adapter.display_name == "ssh myhost"
