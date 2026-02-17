"""CLI interface for kitchen-sync."""

from __future__ import annotations

import shutil
import sys

import click

from kitchen_sync import __version__
from kitchen_sync.adapters import create_adapter
from kitchen_sync.config import (
    Config,
    EnvironmentConfig,
    EnvTargetConfig,
    TargetConfig,
    load_config,
    save_config,
)
from kitchen_sync.profiles import PROFILES, get_profile
from kitchen_sync.sync import (
    collect_files,
    diff_trees,
    git_pull,
    git_push,
    git_status_for_paths,
    prepare_staging,
)


def styled(text: str, **kwargs) -> str:
    return click.style(text, **kwargs)


def info(msg: str) -> None:
    click.echo(f"  {msg}")


def success(msg: str) -> None:
    click.echo(f"  {styled(msg, fg='green')}")


def warn(msg: str) -> None:
    click.echo(f"  {styled(msg, fg='yellow')}")


def error(msg: str) -> None:
    click.echo(f"  {styled(msg, fg='red')}")


def heading(msg: str) -> None:
    click.echo(f"\n  {styled(msg, bold=True)}")


@click.group()
@click.version_option(version=__version__, prog_name="kitchen-sync")
@click.option("--verbose", "-v", is_flag=True, help="Verbose output.")
@click.pass_context
def cli(ctx: click.Context, verbose: bool) -> None:
    """Sync AI coding tool configs across environments."""
    ctx.ensure_object(dict)
    ctx.obj["verbose"] = verbose


@cli.command()
def init() -> None:
    """Interactive setup: pick a profile, set repo URL, register environments."""
    click.echo()
    info("Welcome to kitchen-sync! Let's set up your kitchen to sync AI settings across environments.")
    click.echo()

    config = load_config()

    # Pick profile
    profile_names = list(PROFILES.keys())
    info("What are we syncing?")
    for i, name in enumerate(profile_names, 1):
        profile = PROFILES[name]
        info(f"  {i}. {name} ({profile['local_dir']})")

    choice = click.prompt("  Choice", type=int, default=1)
    if choice < 1 or choice > len(profile_names):
        error("Invalid choice.")
        return

    profile_name = profile_names[choice - 1]
    profile = PROFILES[profile_name]
    click.echo()

    # Repo URL
    repo = click.prompt(
        "  Git repo URL",
        type=str,
    )
    click.echo()

    # Check for existing target
    existing = config.get_target(profile_name)
    if existing:
        info(f"Updating existing target '{profile_name}'.")
        existing.repo = repo
    else:
        target = TargetConfig(
            name=profile_name,
            profile=profile_name,
            repo=repo,
            local_dir=profile["local_dir"],
            sync_paths=list(profile["sync_paths"]),
        )
        config.targets.append(target)

    # Ask about git_env (proxy settings)
    if click.confirm("  Does the git repo need proxy settings?", default=False):
        proxy = click.prompt("  HTTPS_PROXY", default="socks5://127.0.0.1:8080")
        t = config.get_target(profile_name)
        if t:
            t.git_env = {"HTTPS_PROXY": proxy, "HTTP_PROXY": proxy}
        click.echo()

    # Ask about environments
    if click.confirm("  Add a Docker environment?", default=False):
        env_name = click.prompt("  Environment name", default="my-container")
        image = click.prompt(
            "  Docker image",
            default="ubuntu:latest",
        )
        target_dir = click.prompt(
            "  Target directory in container",
            default=f"/home/remote-user/{profile['local_dir'].split('/')[-1]}",
        )
        env = EnvironmentConfig(
            name=env_name,
            type="docker",
            image=image,
            targets={
                profile_name: EnvTargetConfig(
                    target_dir=target_dir,
                    resolve_symlinks=True,
                )
            },
        )
        config.environments[env_name] = env
        click.echo()

    if click.confirm("  Add an SSH environment?", default=False):
        env_name = click.prompt("  Environment name", default="my-server")
        host = click.prompt("  SSH host", default="my-server")
        target_dir = click.prompt(
            "  Target directory on host",
            default=f"~/{profile['local_dir'].split('/')[-1]}",
        )
        env = EnvironmentConfig(
            name=env_name,
            type="ssh",
            host=host,
            targets={
                profile_name: EnvTargetConfig(
                    target_dir=target_dir,
                    resolve_symlinks=True,
                )
            },
        )
        config.environments[env_name] = env
        click.echo()

    save_config(config)
    click.echo()
    success(f"Config saved to {config_path_display()}")
    info("Ready to cook! Try: kitchen-sync status")
    click.echo()


@cli.command()
def status() -> None:
    """Show uncommitted changes in sync paths and ahead/behind remote."""
    config = load_config()
    if not config.targets:
        warn("No targets configured. Run: kitchen-sync init")
        return

    click.echo()
    info("Checking the pantry...")
    click.echo()

    for target in config.targets:
        heading(f"{target.name} ({target.local_dir})")

        if not target.local_path.exists():
            warn(f"  Directory not found: {target.local_dir}")
            continue

        # Check if it's a git repo
        git_dir = target.local_path / ".git"
        if not git_dir.exists():
            warn("  Not a git repository.")
            continue

        status = git_status_for_paths(
            target.local_path, target.sync_paths, target.git_env
        )

        if status["modified"]:
            info(
                f"  {len(status['modified'])} file(s) simmering (uncommitted changes):"
            )
            for m in status["modified"]:
                info(f"    {styled(m, fg='yellow')}")
        else:
            info("  All ingredients fresh.")

        if status["ahead"] > 0:
            info(
                f"  {status['ahead']} commit(s) ahead of remote (ready to serve)"
            )
        if status["behind"] > 0:
            info(
                f"  {status['behind']} commit(s) behind remote (needs a pull)"
            )
        if (
            not status["modified"]
            and status["ahead"] == 0
            and status["behind"] == 0
        ):
            info("  Nothing to sync.")

    click.echo()


@cli.command()
@click.option("-m", "--message", default=None, help="Commit message.")
@click.option("--dry-run", is_flag=True, help="Show what would be committed.")
@click.option(
    "--target",
    "-t",
    "target_name",
    default=None,
    help="Sync a specific target only.",
)
def push(message: str | None, dry_run: bool, target_name: str | None) -> None:
    """Stage sync paths, commit, and push to git."""
    config = load_config()
    if not config.targets:
        warn("No targets configured. Run: kitchen-sync init")
        return

    targets = config.targets
    if target_name:
        t = config.get_target(target_name)
        if not t:
            error(f"Target '{target_name}' not found.")
            return
        targets = [t]

    click.echo()

    for target in targets:
        heading(f"Prepping {target.name}...")

        if not target.local_path.exists():
            warn(f"  Directory not found: {target.local_dir}")
            continue

        msg = message or "kitchen-sync: update configs"

        result = git_push(
            target.local_path,
            target.sync_paths,
            msg,
            target.git_env,
            dry_run,
        )

        if not result["files_staged"]:
            info("  Nothing new to commit. Pantry is clean.")
            continue

        for f in result["files_staged"]:
            info(f"  Staged: {styled(f, fg='cyan')}")

        if dry_run:
            info("  (dry-run) Would commit and push the above.")
        else:
            info(f'  Cooking up commit: "{msg}"')
            info(
                f"  Serving to origin... {styled('done!', fg='green')} ({result['commit_hash']})"
            )

    click.echo()


@cli.command()
@click.option("--dry-run", is_flag=True, help="Show what would change.")
@click.option(
    "--target",
    "-t",
    "target_name",
    default=None,
    help="Pull a specific target only.",
)
def pull(dry_run: bool, target_name: str | None) -> None:
    """Pull latest from remote."""
    config = load_config()
    if not config.targets:
        warn("No targets configured. Run: kitchen-sync init")
        return

    targets = config.targets
    if target_name:
        t = config.get_target(target_name)
        if not t:
            error(f"Target '{target_name}' not found.")
            return
        targets = [t]

    click.echo()

    for target in targets:
        heading(f"Pulling {target.name}...")

        if not target.local_path.exists():
            warn(f"  Directory not found: {target.local_dir}")
            continue

        try:
            output = git_pull(target.local_path, target.git_env, dry_run)
            info(f"  {output}")
        except Exception as e:
            error(f"  Pull failed: {e}")

    click.echo()


@cli.command()
@click.argument("env_name")
@click.option("--dry-run", is_flag=True, help="Show what would be deployed.")
def install(env_name: str, dry_run: bool) -> None:
    """Deploy configs to a named environment."""
    config = load_config()
    env_config = config.get_environment(env_name)
    if not env_config:
        error(f"Environment '{env_name}' not found in config.")
        info(f"Available: {', '.join(config.environments.keys()) or '(none)'}")
        return

    click.echo()

    # Build adapter config dict
    adapter_conf = {"type": env_config.type}
    if env_config.image:
        adapter_conf["image"] = env_config.image
    if env_config.host:
        adapter_conf["host"] = env_config.host

    adapter = create_adapter(adapter_conf)

    info(f"Finding the kitchen... ({env_name})")

    if not adapter.is_available():
        error(f"  No kitchen found!")
        if env_config.type == "docker":
            info(
                f"  Tip: Start the container for {env_config.image}, then try again."
            )
        elif env_config.type == "ssh":
            info(f"  Tip: Check SSH connectivity to {env_config.host}.")
        return

    success(f"  Connected to {adapter.display_name}")
    click.echo()

    for target_name, env_target in env_config.targets.items():
        target = config.get_target(target_name)
        if not target:
            warn(f"  Target '{target_name}' not found in config, skipping.")
            continue

        heading(f"Plating {target.name} to {env_target.target_dir}")

        if not target.local_path.exists():
            warn(f"  Source not found: {target.local_dir}")
            continue

        # Stage with symlink resolution
        staging = prepare_staging(
            target.local_path,
            target.sync_paths,
            resolve_symlinks=env_target.resolve_symlinks,
        )

        # Count resolved symlinks
        symlink_count = _count_resolved_symlinks(
            target.local_path, target.sync_paths
        )

        # Show what's being deployed
        garnish = [
            sp
            for sp in target.sync_paths
            if (staging / sp).exists()
        ]
        if garnish:
            info(f"  Garnishing: {', '.join(garnish)}")
        else:
            info("  Nothing to plate (no matching files).")
            shutil.rmtree(staging, ignore_errors=True)
            continue

        if symlink_count > 0:
            info(f"  Resolved {symlink_count} symlink(s)")

        if dry_run:
            info("  (dry-run) Would deploy the above.")
            shutil.rmtree(staging, ignore_errors=True)
            continue

        # Clean and deploy
        adapter.clean(env_target.target_dir, target.sync_paths)
        deployed = adapter.deploy(
            staging, env_target.target_dir, target.sync_paths
        )
        shutil.rmtree(staging, ignore_errors=True)

    click.echo()
    if not dry_run:
        success(f"  Order up! {env_name} is served.")
    click.echo()


@cli.command()
@click.argument("env_name")
def diff(env_name: str) -> None:
    """Show unified diff of local vs remote environment."""
    config = load_config()
    env_config = config.get_environment(env_name)
    if not env_config:
        error(f"Environment '{env_name}' not found in config.")
        return

    click.echo()

    adapter_conf = {"type": env_config.type}
    if env_config.image:
        adapter_conf["image"] = env_config.image
    if env_config.host:
        adapter_conf["host"] = env_config.host

    adapter = create_adapter(adapter_conf)

    info(f"Tasting {env_name} against local...")

    if not adapter.is_available():
        error(f"  Can't reach {env_name}.")
        return

    click.echo()
    has_diff = False

    for target_name, env_target in env_config.targets.items():
        target = config.get_target(target_name)
        if not target:
            continue

        heading(f"{target.name}")

        # Collect local files
        local_files = collect_files(target.local_path, target.sync_paths)

        # Collect remote files
        remote_files = {}
        for sp in target.sync_paths:
            remote_path = f"{env_target.target_dir}/{sp}"
            files_in_path = adapter.list_files(remote_path)

            for rel in files_in_path:
                full_rel = f"{sp}/{rel}"
                content = adapter.read_file(f"{remote_path}/{rel}")
                if content is not None:
                    remote_files[full_rel] = content

            # Also try reading as a single file
            content = adapter.read_file(remote_path)
            if content is not None and sp not in remote_files:
                remote_files[sp] = content

        diffs = diff_trees(local_files, remote_files)

        if diffs:
            has_diff = True
            for d in diffs:
                click.echo(d)
        else:
            info("  Everything matches.")

    if not has_diff:
        click.echo()
        success("  Everything matches. Chef's kiss.")
    click.echo()


@cli.command("list-profiles")
def list_profiles_cmd() -> None:
    """Show available platform profiles."""
    click.echo()
    heading("Available profiles")
    click.echo()

    for name, profile in PROFILES.items():
        info(f"{styled(name, bold=True)}")
        info(f"  Directory: {profile['local_dir']}")
        info(f"  Sync paths: {', '.join(profile['sync_paths'])}")
        click.echo()


def config_path_display() -> str:
    from kitchen_sync.config import CONFIG_FILE

    return str(CONFIG_FILE)


def _count_resolved_symlinks(source_dir, sync_paths) -> int:
    """Count how many symlinks exist in the sync paths."""
    count = 0
    for sp in sync_paths:
        src = source_dir / sp
        if not src.exists():
            continue
        if src.is_symlink():
            count += 1
        elif src.is_dir():
            for item in src.rglob("*"):
                if item.is_symlink():
                    count += 1
    return count
