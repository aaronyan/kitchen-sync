"""SSH/rsync environment adapter."""

from __future__ import annotations

import subprocess
from pathlib import Path

from kitchen_sync.adapters.base import Environment


class SshEnvironment(Environment):
    """Adapter that deploys via SSH and rsync."""

    def __init__(self, host: str, targets: dict | None = None):
        super().__init__(targets)
        self.host = host

    def is_available(self) -> bool:
        result = subprocess.run(
            ["ssh", "-o", "ConnectTimeout=5", self.host, "true"],
            capture_output=True,
        )
        return result.returncode == 0

    def run(self, cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["ssh", self.host] + cmd,
            capture_output=True,
            text=True,
            **kwargs,
        )

    def read_file(self, path: str) -> str | None:
        result = self.run(["cat", path])
        if result.returncode == 0:
            return result.stdout
        return None

    def list_files(self, path: str) -> list[str]:
        result = self.run(["find", path, "-type", "f"])
        if result.returncode != 0:
            return []
        files = []
        for line in result.stdout.strip().splitlines():
            if line.startswith(path):
                rel = line[len(path) :].lstrip("/")
                if rel:
                    files.append(rel)
        return sorted(files)

    def deploy(
        self,
        staging_dir: Path,
        target_dir: str,
        sync_paths: list[str],
    ) -> list[str]:
        deployed = []

        # Ensure target dir exists
        self.run(["mkdir", "-p", target_dir])

        for sp in sync_paths:
            src = staging_dir / sp
            if not src.exists():
                continue

            remote_path = f"{self.host}:{target_dir}/{sp}"

            if src.is_dir():
                # rsync directory contents
                # Ensure parent dir exists on remote
                parent = f"{target_dir}/{sp}"
                self.run(["mkdir", "-p", parent])
                subprocess.run(
                    [
                        "rsync",
                        "-avz",
                        "--delete",
                        "-e",
                        "ssh",
                        f"{src}/",
                        f"{remote_path}/",
                    ],
                    check=True,
                    capture_output=True,
                )
            else:
                # rsync single file
                parent_dir = str(Path(f"{target_dir}/{sp}").parent)
                self.run(["mkdir", "-p", parent_dir])
                subprocess.run(
                    [
                        "rsync",
                        "-avz",
                        "-e",
                        "ssh",
                        str(src),
                        remote_path,
                    ],
                    check=True,
                    capture_output=True,
                )
            deployed.append(sp)

        return deployed

    def clean(self, target_dir: str, sync_paths: list[str]) -> None:
        for sp in sync_paths:
            self.run(["rm", "-rf", f"{target_dir}/{sp}"])

    @property
    def display_name(self) -> str:
        return f"ssh {self.host}"
