"""Abstract base class for environment adapters."""

from __future__ import annotations

import subprocess
from abc import ABC, abstractmethod
from pathlib import Path


class Environment(ABC):
    """An environment where config files can be deployed."""

    def __init__(self, targets: dict | None = None):
        self.targets = targets or {}

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this environment is reachable."""

    @abstractmethod
    def run(self, cmd: list[str], **kwargs) -> subprocess.CompletedProcess:
        """Execute a command in the environment."""

    @abstractmethod
    def read_file(self, path: str) -> str | None:
        """Read a single file from the environment. Returns None if not found."""

    @abstractmethod
    def list_files(self, path: str) -> list[str]:
        """Recursively list files under path, returning relative paths."""

    @abstractmethod
    def deploy(
        self,
        staging_dir: Path,
        target_dir: str,
        sync_paths: list[str],
    ) -> list[str]:
        """Deploy staged files to the environment.

        Returns list of files deployed.
        """

    @abstractmethod
    def clean(self, target_dir: str, sync_paths: list[str]) -> None:
        """Remove existing sync paths in the environment before deploy."""

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name for status messages."""
