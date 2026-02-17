"""Tests for the sync engine."""

import os
from pathlib import Path

from kitchen_sync.sync import collect_files, diff_trees, prepare_staging


class TestPrepareStaging:
    def test_copies_regular_files(self, mock_source_dir):
        staging = prepare_staging(
            mock_source_dir, ["CLAUDE.md", "settings.json"]
        )
        assert (staging / "CLAUDE.md").read_text() == "# My Config\n"
        assert (staging / "settings.json").read_text() == '{"key": "value"}\n'

    def test_copies_directories(self, mock_source_dir):
        staging = prepare_staging(mock_source_dir, ["commands"])
        assert (staging / "commands" / "commit.md").exists()
        assert (staging / "commands" / "review.md").exists()

    def test_skips_missing_paths(self, mock_source_dir):
        staging = prepare_staging(
            mock_source_dir, ["CLAUDE.md", "nonexistent.txt"]
        )
        assert (staging / "CLAUDE.md").exists()
        assert not (staging / "nonexistent.txt").exists()

    def test_preserves_symlinks_when_not_resolving(self, mock_source_dir):
        staging = prepare_staging(
            mock_source_dir, ["skills"], resolve_symlinks=False
        )
        link = staging / "skills" / "ext-skill"
        assert link.is_symlink()

    def test_resolves_symlinks_when_requested(self, mock_source_dir):
        staging = prepare_staging(
            mock_source_dir, ["skills"], resolve_symlinks=True
        )
        resolved = staging / "skills" / "ext-skill"
        # Should be a real directory, not a symlink
        assert not resolved.is_symlink()
        assert resolved.is_dir()
        assert (resolved / "ext-skill.md").read_text() == "external skill content\n"


class TestCollectFiles:
    def test_collects_single_files(self, mock_source_dir):
        files = collect_files(mock_source_dir, ["CLAUDE.md"])
        assert "CLAUDE.md" in files
        assert files["CLAUDE.md"] == "# My Config\n"

    def test_collects_directory_files(self, mock_source_dir):
        files = collect_files(mock_source_dir, ["commands"])
        assert "commands/commit.md" in files
        assert "commands/review.md" in files

    def test_skips_missing_paths(self, mock_source_dir):
        files = collect_files(mock_source_dir, ["nonexistent"])
        assert files == {}


class TestDiffTrees:
    def test_identical_trees(self):
        a = {"file.md": "hello\n"}
        b = {"file.md": "hello\n"}
        assert diff_trees(a, b) == []

    def test_local_only_file(self):
        local = {"new.md": "content\n"}
        remote = {}
        diffs = diff_trees(local, remote)
        assert len(diffs) == 1
        assert "local only" in diffs[0]

    def test_remote_only_file(self):
        local = {}
        remote = {"old.md": "content\n"}
        diffs = diff_trees(local, remote)
        assert len(diffs) == 1
        assert "remote only" in diffs[0]

    def test_modified_file(self):
        local = {"file.md": "new content\n"}
        remote = {"file.md": "old content\n"}
        diffs = diff_trees(local, remote)
        assert len(diffs) == 1
        assert "---" in diffs[0]
        assert "+++" in diffs[0]
