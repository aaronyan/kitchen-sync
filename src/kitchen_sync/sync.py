"""Core sync engine: staging, symlink resolution, and tree diffing."""

from __future__ import annotations

import difflib
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any


def prepare_staging(
    source_dir: Path,
    sync_paths: list[str],
    resolve_symlinks: bool = False,
) -> Path:
    """Copy sync_paths from source_dir into a temp staging directory.

    If resolve_symlinks is True, symlinks are followed and actual content is
    copied. Otherwise symlinks are preserved as-is.
    """
    staging = Path(tempfile.mkdtemp(prefix="ksync-"))

    for sp in sync_paths:
        src = source_dir / sp
        if not src.exists():
            continue

        dst = staging / sp

        if src.is_file() or (src.is_symlink() and not src.is_dir()):
            dst.parent.mkdir(parents=True, exist_ok=True)
            if resolve_symlinks and src.is_symlink():
                # Copy the resolved content
                real = src.resolve()
                if real.is_dir():
                    shutil.copytree(real, dst)
                else:
                    shutil.copy2(real, dst)
            elif src.is_symlink() and not resolve_symlinks:
                os.symlink(os.readlink(src), dst)
            else:
                shutil.copy2(src, dst)
        elif src.is_dir():
            _copy_dir(src, dst, resolve_symlinks)

    return staging


def _copy_dir(src: Path, dst: Path, resolve_symlinks: bool) -> None:
    """Recursively copy a directory, optionally resolving symlinks."""
    dst.mkdir(parents=True, exist_ok=True)

    for item in src.iterdir():
        item_dst = dst / item.name

        if item.is_symlink():
            if resolve_symlinks:
                real = item.resolve()
                if real.is_dir():
                    shutil.copytree(real, item_dst)
                elif real.is_file():
                    shutil.copy2(real, item_dst)
                # Skip broken symlinks
            else:
                os.symlink(os.readlink(item), item_dst)
        elif item.is_dir():
            _copy_dir(item, item_dst, resolve_symlinks)
        elif item.is_file():
            shutil.copy2(item, item_dst)


def collect_files(base_dir: Path, sync_paths: list[str]) -> dict[str, str]:
    """Collect all files under sync_paths relative to base_dir.

    Returns {relative_path: content} for text files.
    """
    files = {}
    for sp in sync_paths:
        src = base_dir / sp
        if not src.exists():
            continue
        if src.is_file():
            try:
                files[sp] = src.read_text()
            except (UnicodeDecodeError, PermissionError):
                files[sp] = "<binary>"
        elif src.is_dir():
            for f in sorted(src.rglob("*")):
                if f.is_file():
                    rel = str(f.relative_to(base_dir))
                    try:
                        files[rel] = f.read_text()
                    except (UnicodeDecodeError, PermissionError):
                        files[rel] = "<binary>"
    return files


def diff_trees(
    local_files: dict[str, str],
    remote_files: dict[str, str],
) -> list[str]:
    """Generate unified diffs between local and remote file trees.

    Returns a list of diff strings (one per changed file).
    """
    all_paths = sorted(set(local_files) | set(remote_files))
    diffs = []

    for path in all_paths:
        local_content = local_files.get(path, "")
        remote_content = remote_files.get(path, "")

        if local_content == remote_content:
            continue

        if path not in remote_files:
            label = f"  + {path} (local only)"
            diffs.append(label)
            continue

        if path not in local_files:
            label = f"  - {path} (remote only)"
            diffs.append(label)
            continue

        diff_lines = difflib.unified_diff(
            remote_content.splitlines(keepends=True),
            local_content.splitlines(keepends=True),
            fromfile=f"remote/{path}",
            tofile=f"local/{path}",
        )
        diff_text = "".join(diff_lines)
        if diff_text:
            diffs.append(diff_text)

    return diffs


def git_status_for_paths(
    repo_dir: Path,
    sync_paths: list[str],
    git_env: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Get git status information scoped to sync_paths.

    Returns dict with:
      - modified: list of modified/untracked files
      - ahead: number of commits ahead of remote
      - behind: number of commits behind remote
    """
    env = {**os.environ, **(git_env or {})}

    # Get status for sync paths
    cmd = ["git", "status", "--porcelain", "--"] + sync_paths
    result = subprocess.run(
        cmd, capture_output=True, text=True, cwd=repo_dir, env=env
    )
    modified = []
    for line in result.stdout.strip().splitlines():
        if line:
            modified.append(line.strip())

    # Get ahead/behind
    ahead = 0
    behind = 0
    result = subprocess.run(
        ["git", "rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        capture_output=True,
        text=True,
        cwd=repo_dir,
        env=env,
    )
    if result.returncode == 0 and result.stdout.strip():
        parts = result.stdout.strip().split()
        if len(parts) == 2:
            ahead = int(parts[0])
            behind = int(parts[1])

    return {"modified": modified, "ahead": ahead, "behind": behind}


def git_push(
    repo_dir: Path,
    sync_paths: list[str],
    message: str,
    git_env: dict[str, str] | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Stage sync_paths, commit, and push.

    Returns dict with commit_hash and files_staged.
    """
    env = {**os.environ, **(git_env or {})}

    # Stage files
    cmd = ["git", "add", "--"] + sync_paths
    subprocess.run(cmd, cwd=repo_dir, env=env, check=True)

    # Check if there's anything to commit
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only"],
        capture_output=True,
        text=True,
        cwd=repo_dir,
        env=env,
    )
    staged = [f for f in result.stdout.strip().splitlines() if f]

    if not staged:
        return {"commit_hash": None, "files_staged": []}

    if dry_run:
        # Unstage
        subprocess.run(
            ["git", "reset", "HEAD", "--"] + sync_paths,
            cwd=repo_dir,
            env=env,
            capture_output=True,
        )
        return {"commit_hash": "(dry-run)", "files_staged": staged}

    # Commit
    subprocess.run(
        ["git", "commit", "-m", message],
        cwd=repo_dir,
        env=env,
        check=True,
        capture_output=True,
    )

    # Get commit hash
    result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        capture_output=True,
        text=True,
        cwd=repo_dir,
        env=env,
    )
    commit_hash = result.stdout.strip()

    # Push
    subprocess.run(
        ["git", "push"],
        cwd=repo_dir,
        env=env,
        check=True,
        capture_output=True,
    )

    return {"commit_hash": commit_hash, "files_staged": staged}


def git_pull(
    repo_dir: Path,
    git_env: dict[str, str] | None = None,
    dry_run: bool = False,
) -> str:
    """Pull latest from remote. Returns output message."""
    env = {**os.environ, **(git_env or {})}

    if dry_run:
        result = subprocess.run(
            ["git", "fetch", "--dry-run"],
            capture_output=True,
            text=True,
            cwd=repo_dir,
            env=env,
        )
        return result.stderr.strip() or "Already up to date."

    result = subprocess.run(
        ["git", "pull"],
        capture_output=True,
        text=True,
        cwd=repo_dir,
        env=env,
        check=True,
    )
    return result.stdout.strip() or "Already up to date."
