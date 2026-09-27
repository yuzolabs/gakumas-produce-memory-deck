"""GitHub release operations that never overwrite published assets or move tags."""

import json
import os
import subprocess
import time
from pathlib import Path

from release_assets import ASSET_NAMES, digest


def gh_command(*arguments):
    """Execute the installed GitHub CLI and propagate failures without hiding stderr."""
    return subprocess.check_output(["gh", *arguments], text=True).strip()


def github_api(path, *arguments):
    """Decode an authenticated GitHub API response using GH_TOKEN from the job."""
    return json.loads(gh_command("api", path, *arguments))


def repository_path():
    """Require an explicit repository instead of relying on the local checkout's remote."""
    return f"repos/{os.environ['GH_REPO']}"


def find_release(tag):
    """Include drafts when looking up tags; a missing release is not an API error."""
    pages = github_api(f"{repository_path()}/releases", "--paginate", "--slurp")
    matches = [
        release for page in pages for release in page if release["tag_name"] == tag
    ]
    if len(matches) > 1:
        raise ValueError("GitHub release: ambiguous duplicate drafts for tag")
    return matches[0] if matches else None


def wait_for_release(tag):
    """Retry missing required releases after writes; API/authentication failures still propagate."""
    for attempt in range(6):
        release = find_release(tag)
        if release is not None:
            return release
        if attempt < 5:
            time.sleep(5)
    raise ValueError(f"GitHub release: required release not found after retries: {tag}")


def wait_for_release_assets(release, directory):
    """Read by release ID until all uploaded assets match the verified local files."""
    expected = {
        name: f"sha256:{digest((Path(directory) / name).read_bytes())}"
        for name in ASSET_NAMES
    }
    release_id = release["id"]
    for attempt in range(6):
        current = github_api(f"{repository_path()}/releases/{release_id}")
        assets = current["assets"]
        actual = {asset["name"]: asset.get("digest") for asset in assets}
        if (
            actual == expected
            and len(assets) == len(expected)
            and all(asset.get("state") == "uploaded" for asset in assets)
        ):
            return current
        if attempt < 5:
            time.sleep(5)
    raise ValueError(
        "GitHub release: assets are incomplete or differ from verified files after retries"
    )


def verify_tag_commit(tag, commit):
    """Resolve lightweight or annotated remote tags and reject a different commit."""
    reference = github_api(f"{repository_path()}/git/ref/tags/{tag}")["object"]
    for _ in range(8):
        if reference["type"] == "commit":
            if reference["sha"] != commit:
                raise ValueError("GitHub release: tag points to a different commit")
            return
        if reference["type"] != "tag":
            break
        reference = github_api(f"{repository_path()}/git/tags/{reference['sha']}")[
            "object"
        ]
    raise ValueError("GitHub release: tag does not resolve to a commit")


def check_tag_available(tag, commit):
    """Reject conflicting existing tags without treating expected absence as gh: Not Found."""
    references = github_api(f"{repository_path()}/git/matching-refs/tags/{tag}")
    if any(item["ref"] == f"refs/tags/{tag}" for item in references):
        verify_tag_commit(tag, commit)


def download_release(release, destination, require_complete=True):
    """Download known assets by release ID; drafts are supported for interrupted uploads."""
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    assets = release["assets"]
    names = [asset["name"] for asset in assets]
    if len(names) != len(set(names)) or set(names) - set(ASSET_NAMES):
        raise ValueError("GitHub release: unexpected or duplicate release assets")
    if require_complete and set(names) != set(ASSET_NAMES):
        raise ValueError("GitHub release: required immutable assets are missing")
    for asset in assets:
        if asset.get("state") != "uploaded" or asset["size"] > 200 * 1024 * 1024:
            raise ValueError("GitHub release: invalid asset state or size")
        with (destination / asset["name"]).open("wb") as output:
            subprocess.run(
                [
                    "gh",
                    "api",
                    f"{repository_path()}/releases/assets/{asset['id']}",
                    "-H",
                    "Accept: application/octet-stream",
                ],
                stdout=output,
                check=True,
            )


def verify_immutable_release(release, directory):
    """Verify release attestation and every local asset; mutable releases fail closed."""
    if release["draft"] or not release.get("immutable"):
        raise ValueError("GitHub release: a published Immutable release is required")
    tag = release["tag_name"]
    gh_command("release", "verify", tag, "--repo", os.environ["GH_REPO"])
    for name in ASSET_NAMES:
        gh_command(
            "release",
            "verify-asset",
            tag,
            str(Path(directory) / name),
            "--repo",
            os.environ["GH_REPO"],
        )


def ensure_draft(tag, commit, prerelease, notes):
    """Reuse only a matching draft or create one; do not publish or move existing tags."""
    check_tag_available(tag, commit)
    existing = find_release(tag)
    if existing:
        if existing["prerelease"] != prerelease or (
            existing["draft"] and existing["target_commitish"] != commit
        ):
            raise ValueError(
                "GitHub release: existing draft has a different target or release type"
            )
        return existing
    # Use the POST response directly: the releases list may not show a new draft yet.
    release = github_api(
        f"{repository_path()}/releases",
        "--method",
        "POST",
        "--raw-field",
        f"tag_name={tag}",
        "--raw-field",
        f"target_commitish={commit}",
        "--raw-field",
        f"name={tag}",
        "--raw-field",
        f"body={notes}",
        "--field",
        "draft=true",
        "--field",
        f"prerelease={str(prerelease).lower()}",
        "--raw-field",
        "make_latest=false",
    )
    if (
        not isinstance(release, dict)
        or release.get("draft") is not True
        or release.get("tag_name") != tag
        or release.get("target_commitish") != commit
        or release.get("prerelease") is not prerelease
    ):
        raise ValueError("GitHub release: unexpected draft creation response")
    return release


def upload_missing_assets(release, directory):
    """Upload missing draft assets only; even drafts never use --clobber."""
    if not release["draft"]:
        raise ValueError("GitHub release: refusing to upload to a published release")
    for name in ASSET_NAMES:
        existing = next(
            (asset for asset in release["assets"] if asset["name"] == name), None
        )
        path = Path(directory) / name
        if existing:
            if existing.get("digest") != f"sha256:{digest(path.read_bytes())}":
                raise ValueError(
                    f"GitHub release: existing draft asset conflicts: {name}"
                )
        else:
            gh_command(
                "api",
                f"https://uploads.github.com/{repository_path()}/releases/{release['id']}/assets?name={name}",
                "--method",
                "POST",
                "--header",
                "Content-Type: application/octet-stream",
                "--input",
                str(path),
            )


def publish_release(tag, commit, directory, prerelease):
    """Publish a complete draft, then require GitHub's immutable attestation to verify."""
    release = wait_for_release(tag)
    check_tag_available(tag, commit)
    if release["draft"]:
        if release["target_commitish"] != commit or release["prerelease"] != prerelease:
            raise ValueError("GitHub release: draft target changed before publication")
        release = wait_for_release_assets(release, directory)
        if (
            not release["draft"]
            or release["tag_name"] != tag
            or release["target_commitish"] != commit
            or release["prerelease"] != prerelease
        ):
            raise ValueError("GitHub release: draft target changed before publication")
        gh_command(
            "release",
            "edit",
            tag,
            "--draft=false",
            f"--prerelease={str(prerelease).lower()}",
            f"--latest={str(not prerelease).lower()}",
            "--repo",
            os.environ["GH_REPO"],
        )
    # Attestations may take a short time to become available after publication.
    for attempt in range(6):
        try:
            release = find_release(tag)
            if release is None:
                raise ValueError("GitHub release: published release is not visible yet")
            verify_tag_commit(tag, commit)
            verify_immutable_release(release, directory)
            print(f"Immutable release ready: {release['html_url']}")
            return
        except (ValueError, subprocess.CalledProcessError):
            if attempt == 5:
                raise
            time.sleep(5)
