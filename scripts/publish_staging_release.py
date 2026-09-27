"""Attach verified staging output to a draft, then publish an immutable beta release."""

import json
import os
import tempfile
from pathlib import Path

from github_releases import (
    download_release,
    ensure_draft,
    publish_release,
    upload_missing_assets,
    verify_immutable_release,
    verify_tag_commit,
)
from release_assets import (
    json_bytes,
    promote_site,
    read_site,
    stable_version,
    verify_bundle,
    write_bundle,
    write_checksums,
)


def publish_staging_release():
    """Run only after the staging smoke step has passed, in the same build job."""
    beta = os.environ["BETA_TAG"]
    stable_version(beta)
    commit = os.environ["GITHUB_SHA"]
    metadata = {
        "environment": "staging",
        "version": beta,
        "commit": commit,
        "workflow": {
            "repository": os.environ["GH_REPO"],
            "path": ".github/workflows/deploy-staging.yml",
            "runId": int(os.environ["GITHUB_RUN_ID"]),
            "runAttempt": int(os.environ["GITHUB_RUN_ATTEMPT"]),
        },
    }
    files = read_site("dist")
    with tempfile.TemporaryDirectory(prefix="staging-release-") as temporary:
        directory = Path(temporary) / "bundle"
        manifest = write_bundle(directory, files, metadata)
        promote_site(
            files, manifest, 0
        )  # Validate the beta stamp and staging-only headers.
        notes = (
            f"Staging: {os.environ['STAGING_URL']}\n\nCommit: {commit}\n\n"
            f"Workflow: https://github.com/{os.environ['GH_REPO']}/actions/runs/{os.environ['GITHUB_RUN_ID']}\n\n"
            "The staging URL changes on subsequent deployments. Assets preserve this verified version."
        )
        release = ensure_draft(beta, commit, True, notes)
        previous = Path(temporary) / "previous"
        download_release(release, previous, require_complete=not release["draft"])
        old_manifest_path = previous / "manifest.json"
        if old_manifest_path.exists():
            old = json.loads(old_manifest_path.read_bytes())
            if {key: value for key, value in old.items() if key != "workflow"} != {
                key: value for key, value in manifest.items() if key != "workflow"
            }:
                raise ValueError(
                    "Staging release: existing bundle differs; use a new beta version"
                )
            if release["draft"] and (
                old["workflow"]["runId"] != metadata["workflow"]["runId"]
                or old["workflow"]["repository"] != os.environ["GH_REPO"]
                or old["workflow"]["path"] != metadata["workflow"]["path"]
                or old["workflow"]["runAttempt"] > metadata["workflow"]["runAttempt"]
            ):
                raise ValueError(
                    "Staging release: draft belongs to a different workflow run"
                )
            # Preserve the original successful smoke attempt when resuming a partial upload.
            (directory / "manifest.json").write_bytes(json_bytes(old))
            write_checksums(directory)
        if not release["draft"]:
            verify_tag_commit(beta, commit)
            verify_immutable_release(release, previous)
            verify_bundle(previous)
            print(f"Staging immutable beta already exists: {release['html_url']}")
            return
        upload_missing_assets(release, directory)
        publish_release(beta, commit, directory, prerelease=True)


if __name__ == "__main__":
    publish_staging_release()
