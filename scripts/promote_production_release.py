"""Promote immutable beta assets without checking out beta code, rebuilding, or testing it."""

import argparse
import os
import re
import tempfile
from pathlib import Path

from github_releases import (
    download_release,
    ensure_draft,
    find_release,
    github_api,
    publish_release,
    repository_path,
    upload_missing_assets,
    verify_immutable_release,
    verify_tag_commit,
)
from release_assets import (
    ASSET_NAMES,
    PRODUCTION_URL,
    json_bytes,
    materialize_site,
    promote_site,
    stable_version,
    verify_bundle,
    write_bundle,
)
from verify_production_site import verify_production_site

PRODUCTION_DIRECTORY = Path(".release/production")


def verify_staging_workflow(manifest):
    """Require a successful trusted staging run and its recorded successful remote smoke step."""
    workflow = manifest["workflow"]
    if (
        workflow["repository"] != os.environ["GH_REPO"]
        or workflow["path"] != ".github/workflows/deploy-staging.yml"
        or type(workflow["runId"]) is not int
        or workflow["runId"] <= 0
        or type(workflow["runAttempt"]) is not int
        or workflow["runAttempt"] <= 0
    ):
        raise ValueError("Release promotion: invalid staging provenance")
    prefix = f"{repository_path()}/actions/runs/{workflow['runId']}"
    run = github_api(prefix)
    if (
        run["status"] != "completed"
        or run["conclusion"] != "success"
        or run["head_sha"] != manifest["commit"]
        or run["head_branch"] != "main"
        or run["event"] != "workflow_dispatch"
        or run["path"] != workflow["path"]
        or run["repository"]["full_name"] != os.environ["GH_REPO"]
    ):
        raise ValueError(
            "Release promotion: staging workflow did not succeed for this commit"
        )
    attempt = github_api(f"{prefix}/attempts/{workflow['runAttempt']}")
    if attempt["head_sha"] != manifest["commit"]:
        raise ValueError("Release promotion: staging attempt commit mismatch")
    pages = github_api(
        f"{prefix}/attempts/{workflow['runAttempt']}/jobs", "--paginate", "--slurp"
    )
    verified = any(
        job["name"] == "Deploy and verify staging"
        and any(
            step["name"] == "Verify deployed staging site"
            and step["conclusion"] == "success"
            for step in job["steps"]
        )
        for page in pages
        for job in page["jobs"]
    )
    if not verified:
        raise ValueError(
            "Release promotion: recorded staging smoke step did not succeed"
        )


def load_verified_beta(beta, directory):
    """Download and verify all immutable assets before interpreting manifest or archive data."""
    stable_version(beta)
    release = find_release(beta)
    if (
        not release
        or release["draft"]
        or not release.get("immutable")
        or not release["prerelease"]
    ):
        raise ValueError(
            "Release promotion: published immutable beta prerelease is required"
        )
    download_release(release, directory)
    verify_immutable_release(release, directory)
    manifest, files = verify_bundle(directory)
    if manifest.get("version") != beta or manifest.get("environment") != "staging":
        raise ValueError("Release promotion: beta manifest identity mismatch")
    verify_tag_commit(beta, manifest["commit"])
    verify_staging_workflow(manifest)
    return release, manifest, files


def reject_release_downgrade(version):
    """Normal promotion cannot create an older release; rollback is a separate manual operation."""
    target = tuple(map(int, version[1:].split(".")))
    pages = github_api(f"{repository_path()}/releases", "--paginate", "--slurp")
    for page in pages:
        for release in page:
            if (
                not release["draft"]
                and re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+", release["tag_name"])
                and tuple(map(int, release["tag_name"][1:].split("."))) > target
            ):
                raise ValueError(
                    "Release promotion: a newer stable version is already published"
                )


def emit_outputs(version, commit, published):
    """Expose only validated scalars to subsequent workflow steps."""
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(
                f"version={version}\ncommit={commit}\nalready_published={str(published).lower()}\n"
            )


def prepare_production_release(beta, inspect_only=False):
    """Verify the source and stage a complete draft before any Cloudflare publication."""
    with tempfile.TemporaryDirectory(prefix="beta-promotion-") as temporary:
        source_release, manifest, files = load_verified_beta(
            beta, Path(temporary) / "beta"
        )
        promoted, metadata = promote_site(files, manifest, source_release["id"])
        version, commit = metadata["version"], metadata["commit"]
        if inspect_only:
            reject_release_downgrade(version)
            print(f"Verified promotion: {beta} -> {version} ({commit})")
            emit_outputs(version, commit, False)
            return
        reject_release_downgrade(version)
        bundle = PRODUCTION_DIRECTORY / "bundle"
        write_bundle(bundle, promoted, metadata)
        notes = (
            f"Production: {PRODUCTION_URL}\n\nSource beta: {beta}\n\nCommit: {commit}\n\n"
            f"Promotion workflow: https://github.com/{os.environ['GH_REPO']}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
        )
        release = ensure_draft(version, commit, False, notes)
        previous = Path(temporary) / "previous"
        download_release(release, previous, require_complete=not release["draft"])
        for name in ASSET_NAMES:
            old = previous / name
            if old.exists() and old.read_bytes() != (bundle / name).read_bytes():
                raise ValueError(
                    "Release promotion: existing stable release belongs to different beta assets"
                )
        if not release["draft"]:
            verify_tag_commit(version, commit)
            verify_immutable_release(release, previous)
            print(
                f"Production release already published; no deployment: {release['html_url']}"
            )
            emit_outputs(version, commit, True)
            return
        upload_missing_assets(release, bundle)
        # Use the draft's downloaded bytes, not a second transformation, for actual deployment.
        download_release(find_release(version), PRODUCTION_DIRECTORY / "verified")
        actual_manifest, actual_files = verify_bundle(PRODUCTION_DIRECTORY / "verified")
        if actual_manifest != verify_bundle(bundle)[0]:
            raise ValueError("Release promotion: uploaded production assets changed")
        materialize_site(PRODUCTION_DIRECTORY / "site", actual_files)
        (PRODUCTION_DIRECTORY / "wrangler.jsonc").write_bytes(
            json_bytes(
                {
                    "name": "gakumas-produce-memory-deck",
                    "pages_build_output_dir": "./site",
                    "compatibility_date": "2026-09-25",
                }
            )
        )
        emit_outputs(version, commit, False)


def finalize_production_release(beta):
    """Recheck the deployed files before freezing a draft; never blindly publish on retry."""
    version = stable_version(beta)
    manifest, files = verify_bundle(PRODUCTION_DIRECTORY / "verified")
    if manifest["version"] != version or manifest["sourceBeta"] != beta:
        raise ValueError("Release promotion: unexpected production bundle")
    verify_production_site(files)
    publish_release(
        version, manifest["commit"], PRODUCTION_DIRECTORY / "verified", prerelease=False
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["inspect", "prepare", "finalize"])
    args = parser.parse_args()
    beta = os.environ["BETA_VERSION"]
    if args.operation == "finalize":
        finalize_production_release(beta)
    else:
        prepare_production_release(beta, inspect_only=args.operation == "inspect")
