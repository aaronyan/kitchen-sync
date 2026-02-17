"""Docker container environment adapter."""

from __future__ import annotations

import subprocess
from pathlib import Path

from kitchen_sync.adapters.base import Environment


class DockerEnvironment(Environment):
    """Adapter that deploys via docker exec/cp to a running container."""

    def __init__(self, image: str, targets: dict | None = None):
        super().__init__(targets)
        self.image = image
        self._container_id: str | None = None

    @property
    def container_id(self) -> str | None:
        """Find the running container ID for this image."""
        if self._container_id is None:
            result = subprocess.run(
                [
                    "docker",
                    "ps",
                    "--filter",
                    f"ancestor={self.image}",
                    "--format",
                    "{{.ID}}",
                ],
                capture_output=True,
                text=True,
            )
            ids = result.stdout.strip().splitlines()
            if ids:
                self._container_id = ids[0]
        return self._container_id

    def is_available(self) -> bool:
        return self.container_id is not None

    def run(self, cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
        cid = self.container_id
        if not cid:
            raise RuntimeError(f"No running container for image {self.image}")
        return subprocess.run(
            ["docker", "exec", cid] + cmd,
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
        cid = self.container_id
        if not cid:
            raise RuntimeError(f"No running container for image {self.image}")

        # Ensure target dir exists
        self.run(["mkdir", "-p", target_dir])

        deployed = []
        for sp in sync_paths:
            src = staging_dir / sp
            if not src.exists():
                continue

            remote_path = f"{target_dir}/{sp}"

            # docker cp local_path container:remote_path
            subprocess.run(
                ["docker", "cp", str(src), f"{cid}:{remote_path}"],
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
        short_id = self.container_id[:12] if self.container_id else "?"
        return f"docker container {short_id}"
