"""Environment adapters for deploying configs to different targets."""

from kitchen_sync.adapters.base import Environment
from kitchen_sync.adapters.docker import DockerEnvironment
from kitchen_sync.adapters.local import LocalEnvironment
from kitchen_sync.adapters.ssh import SshEnvironment


def create_adapter(env_config: dict) -> Environment:
    """Factory: create the right adapter from an environment config block."""
    env_type = env_config["type"]
    if env_type == "docker":
        return DockerEnvironment(
            image=env_config["image"],
            targets=env_config.get("targets", {}),
        )
    elif env_type == "ssh":
        return SshEnvironment(
            host=env_config["host"],
            targets=env_config.get("targets", {}),
        )
    elif env_type == "local":
        return LocalEnvironment(targets=env_config.get("targets", {}))
    else:
        raise ValueError(f"Unknown environment type: {env_type}")
