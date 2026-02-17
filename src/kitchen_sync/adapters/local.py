"""Local filesystem environment adapter."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from kitchen_sync.adapters.base import Environment


class LocalEnvironment(Environment):
    """Adapter for the local filesystem."""

    def is_available(self) -> bool:
        return True

    def run(self, cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
        return subprocess.run(cmd, capture_output=True, text=True, **kwargs)

    def read_file(self, path: str) -> str | None:
        p = Path(path)
        if p.exists() and p.is_file():
            try:
                return p.read_text()
            except (UnicodeDecodeError, PermissionError):
                return None
        return None

    def list_files(self, path: str) -> list[str]:
        base = Path(path)
        if not base.exists():
            return []
        files = []
        for f in sorted(base.rglob("*")):
            if f.is_file():
                files.append(str(f.relative_to(base)))
        return files

    def deploy(
        self,
        staging_dir: Path,
        target_dir: str,
        sync_paths: list[str],
    ) -> list[str]:
        target = Path(target_dir)
        target.mkdir(parents=True, exist_ok=True)
        deployed = []

        for sp in sync_paths:
            src = staging_dir / sp
            if not src.exists():
                continue
            dst = target / sp
            if src.is_dir():
                if dst.exists():
                    shutil.rmtree(dst)
                shutil.copytree(src, dst)
            else:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
            deployed.append(sp)

        return deployed

    def clean(self, target_dir: str, sync_paths: list[str]) -> None:
        target = Path(target_dir)
        for sp in sync_paths:
            p = target / sp
            if p.is_dir():
                shutil.rmtree(p)
            elif p.exists():
                p.unlink()

    @property
    def display_name(self) -> str:
        return "local"
