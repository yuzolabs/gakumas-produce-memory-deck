"""Offline regression tests for immutable release packaging and promotion."""

import gzip
import io
import json
import os
import tarfile
import tempfile
import unittest
from pathlib import Path
from typing import ClassVar
from unittest.mock import patch

import github_releases as github
import promote_production_release as promotion
import release_assets as assets
import verify_production_site as verification

COMMIT = "a" * 40
BETA = "v0.1.0-beta.2"
REPOSITORY = "example/site"


def staging_files():
    return {
        "index.html": b"<!doctype html>site",
        "assets/app.js": b"console.log('site')",
        "skill-card-icons/card-1.webp": b"RIFF",
        "_headers": assets.STAGING_HEADERS.encode(),
        "deployment.json": assets.json_bytes({"commit": COMMIT, "version": BETA}),
    }


def staging_metadata():
    return {
        "environment": "staging",
        "version": BETA,
        "commit": COMMIT,
        "workflow": {
            "repository": REPOSITORY,
            "path": ".github/workflows/deploy-staging.yml",
            "runId": 123,
            "runAttempt": 1,
        },
    }


class ReleaseBundleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name) / "bundle"
        self.addCleanup(self.temporary.cleanup)

    def test_beta_version_mapping(self):
        self.assertEqual(assets.stable_version(BETA), "v0.1.0")
        for invalid in [
            "v0.1.0",
            "v01.1.0-beta.1",
            "v1.0.0-beta.01",
            BETA + "\n",
            "$(id)",
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                assets.stable_version(invalid)

    def test_deterministic_bundle_and_round_trip(self):
        files = staging_files()
        self.assertEqual(
            assets.archive_site(files),
            assets.archive_site(dict(reversed(list(files.items())))),
        )
        expected = assets.write_bundle(self.directory, files, staging_metadata())
        manifest, actual = assets.verify_bundle(self.directory)
        self.assertEqual(actual, files)
        self.assertEqual(manifest, expected)

    def test_checksum_corruption_rejected(self):
        assets.write_bundle(self.directory, staging_files(), staging_metadata())
        (self.directory / "site.tar.gz").write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError, "checksum"):
            assets.verify_bundle(self.directory)

    def test_archive_and_inventory_corruption_rejected(self):
        for key, value in [
            ("archiveSha256", "0" * 64),
            ("files", {}),
            ("schemaVersion", 99),
        ]:
            with self.subTest(key=key):
                manifest = assets.write_bundle(
                    self.directory, staging_files(), staging_metadata()
                )
                manifest[key] = value
                (self.directory / "manifest.json").write_bytes(
                    assets.json_bytes(manifest)
                )
                assets.write_checksums(self.directory)
                with self.assertRaises(ValueError):
                    assets.verify_bundle(self.directory)

    def test_unsafe_paths_and_pages_executables_rejected(self):
        for name in [
            "../secret",
            "/tmp/secret",
            "a/../../secret",
            "a\\secret",
            ".git/config",
            "functions/api.js",
            "_worker.js",
            "wrangler.jsonc",
            "404.html",
            "a\nfile",
        ]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                assets.validate_asset_path(name)

    def test_symlink_in_source_rejected(self):
        source = Path(self.temporary.name) / "source"
        source.mkdir()
        (source / "secret").symlink_to("/etc/passwd")
        with self.assertRaisesRegex(ValueError, "symlinks"):
            assets.read_site(source)

    def test_archive_links_duplicate_and_oversize_rejected(self):
        for mode in ["symlink", "duplicate", "oversize", "traversal"]:
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode="w:gz") as archive:
                entry = tarfile.TarInfo(
                    "../escape" if mode == "traversal" else "index.html"
                )
                if mode == "symlink":
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = "/etc/passwd"
                if mode == "oversize":
                    entry.size = assets.MAX_BUNDLE_BYTES + 1
                archive.addfile(entry)
                if mode == "duplicate":
                    archive.addfile(entry)
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                assets.unpack_site(data.getvalue())

    def test_compressed_padding_bomb_is_bounded_before_tar_parsing(self):
        with (
            patch.object(assets, "MAX_BUNDLE_BYTES", 100),
            patch.object(assets, "MAX_FILES", 0),
            self.assertRaisesRegex(ValueError, "decompressed archive exceeds"),
        ):
            assets.unpack_site(gzip.compress(b"0" * 11000))

    def test_only_two_metadata_files_change_on_promotion(self):
        files = staging_files()
        manifest = assets.write_bundle(self.directory, files, staging_metadata())
        promoted, metadata = assets.promote_site(files, manifest, 42)
        self.assertEqual(
            {name for name in files if files[name] != promoted[name]},
            {"_headers", "deployment.json"},
        )
        self.assertEqual(metadata["sourceArchiveSha256"], manifest["archiveSha256"])
        self.assertEqual(metadata["sourceReleaseId"], 42)
        self.assertEqual(metadata["version"], "v0.1.0")
        self.assertNotIn(b"noindex", promoted["_headers"])
        self.assertEqual(json.loads(promoted["deployment.json"])["sourceBeta"], BETA)
        self.assertEqual(files, staging_files())

    def test_unexpected_staging_headers_or_stamp_rejected(self):
        for name in ["_headers", "deployment.json"]:
            files = staging_files()
            files[name] = b"{}"
            manifest = assets.write_bundle(self.directory, files, staging_metadata())
            with self.subTest(name=name), self.assertRaises(ValueError):
                assets.promote_site(files, manifest, 42)

    def test_materialization_does_not_overwrite_existing_directory(self):
        with self.assertRaises(FileExistsError):
            assets.materialize_site(Path(self.temporary.name), staging_files())


@patch.dict(os.environ, {"GH_REPO": REPOSITORY})
class GitHubReleaseTests(unittest.TestCase):
    def test_missing_release_is_normal_and_drafts_are_found(self):
        with patch.object(github, "github_api", return_value=[[]]):
            self.assertIsNone(github.find_release(BETA))
        draft = {"tag_name": BETA, "draft": True}
        with patch.object(github, "github_api", return_value=[[draft]]):
            self.assertEqual(github.find_release(BETA), draft)
        with (
            patch.object(github, "github_api", return_value=[[draft, draft]]),
            self.assertRaises(ValueError),
        ):
            github.find_release(BETA)

    def test_api_failures_are_not_treated_as_missing_releases(self):
        with (
            patch.object(github, "github_api", side_effect=RuntimeError("403")),
            self.assertRaises(RuntimeError),
        ):
            github.find_release(BETA)

    def test_lightweight_and_annotated_tag_verification(self):
        for reference in [
            {"type": "commit", "sha": COMMIT},
            {"type": "tag", "sha": "b" * 40},
        ]:
            with patch.object(
                github,
                "github_api",
                side_effect=[
                    {"object": reference},
                    {"object": {"type": "commit", "sha": COMMIT}},
                ],
            ):
                github.verify_tag_commit(BETA, COMMIT)
        with (
            patch.object(
                github,
                "github_api",
                return_value={"object": {"type": "commit", "sha": "b" * 40}},
            ),
            self.assertRaises(ValueError),
        ):
            github.verify_tag_commit(BETA, COMMIT)

    def test_mutable_or_draft_release_cannot_be_verified(self):
        for draft, immutable in [(True, False), (False, False)]:
            with self.assertRaises(ValueError):
                github.verify_immutable_release(
                    {"draft": draft, "immutable": immutable}, Path("unused")
                )

    def test_all_three_assets_require_attestation_verification(self):
        with patch.object(github, "gh_command") as command:
            github.verify_immutable_release(
                {"draft": False, "immutable": True, "tag_name": BETA}, Path("assets")
            )
            self.assertEqual(command.call_count, 4)
            self.assertEqual(command.call_args_list[0].args[:2], ("release", "verify"))
            for call in command.call_args_list[1:]:
                self.assertEqual(call.args[:2], ("release", "verify-asset"))

    def test_conflicting_draft_is_rejected(self):
        with (
            patch.object(github, "check_tag_available"),
            patch.object(
                github,
                "find_release",
                return_value={
                    "draft": True,
                    "target_commitish": "different",
                    "prerelease": True,
                },
            ),
            self.assertRaises(ValueError),
        ):
            github.ensure_draft(BETA, COMMIT, True, "notes")

    def test_partial_upload_resumes_without_clobber(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in assets.ASSET_NAMES:
                (directory / name).write_bytes(b"data")
            release = {
                "draft": True,
                "tag_name": BETA,
                "assets": [
                    {
                        "name": "site.tar.gz",
                        "digest": f"sha256:{assets.digest(b'data')}",
                    }
                ],
            }
            with patch.object(github, "gh_command") as command:
                github.upload_missing_assets(release, directory)
                self.assertEqual(command.call_count, 2)
                self.assertTrue(
                    all("--clobber" not in call.args for call in command.call_args_list)
                )
            release["assets"][0]["digest"] = "different"
            with self.assertRaises(ValueError):
                github.upload_missing_assets(release, directory)
            release["draft"] = False
            with self.assertRaises(ValueError):
                github.upload_missing_assets(release, directory)

    def test_incomplete_draft_cannot_publish(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in assets.ASSET_NAMES:
                (directory / name).write_bytes(b"data")
            with (
                patch.object(
                    github,
                    "find_release",
                    return_value={
                        "draft": True,
                        "assets": [],
                        "target_commitish": COMMIT,
                        "prerelease": True,
                    },
                ),
                patch.object(github, "check_tag_available"),
                self.assertRaises(ValueError),
            ):
                github.publish_release(BETA, COMMIT, directory, True)

    def test_draft_target_change_is_rejected_before_publication(self):
        with (
            patch.object(
                github,
                "find_release",
                return_value={
                    "draft": True,
                    "target_commitish": "b" * 40,
                    "prerelease": True,
                },
            ),
            patch.object(github, "check_tag_available"),
            patch.object(github, "gh_command") as command,
            self.assertRaisesRegex(ValueError, "draft target changed"),
        ):
            github.publish_release(BETA, COMMIT, Path("unused"), True)
        command.assert_not_called()

    def test_successful_immutable_publication(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in assets.ASSET_NAMES:
                (directory / name).write_bytes(b"data")
            draft = {
                "draft": True,
                "target_commitish": COMMIT,
                "prerelease": False,
                "assets": [
                    {"name": name, "digest": f"sha256:{assets.digest(b'data')}"}
                    for name in assets.ASSET_NAMES
                ],
            }
            with (
                patch.object(
                    github,
                    "find_release",
                    side_effect=[draft, {"html_url": "https://example/release"}],
                ),
                patch.object(github, "check_tag_available"),
                patch.object(github, "verify_tag_commit"),
                patch.object(github, "verify_immutable_release"),
                patch.object(github, "gh_command") as command,
            ):
                github.publish_release("v0.1.0", COMMIT, directory, False)
                self.assertIn("--draft=false", command.call_args.args)
                self.assertIn("--prerelease=false", command.call_args.args)
                self.assertIn("--latest=true", command.call_args.args)


@patch.dict(os.environ, {"GH_REPO": REPOSITORY})
class ProvenanceTests(unittest.TestCase):
    def successful_run(self):
        return {
            "status": "completed",
            "conclusion": "success",
            "head_sha": COMMIT,
            "head_branch": "main",
            "event": "workflow_dispatch",
            "path": ".github/workflows/deploy-staging.yml",
            "repository": {"full_name": REPOSITORY},
        }

    def test_successful_staging_and_recorded_smoke_are_required(self):
        jobs = [
            {
                "jobs": [
                    {
                        "name": "Deploy and verify staging",
                        "steps": [
                            {
                                "name": "Verify deployed staging site",
                                "conclusion": "success",
                            }
                        ],
                    }
                ]
            }
        ]
        with patch.object(
            promotion,
            "github_api",
            side_effect=[self.successful_run(), {"head_sha": COMMIT}, jobs],
        ):
            promotion.verify_staging_workflow(staging_metadata())
        with (
            patch.object(
                promotion,
                "github_api",
                side_effect=[
                    self.successful_run(),
                    {"head_sha": COMMIT},
                    [{"jobs": []}],
                ],
            ),
            self.assertRaises(ValueError),
        ):
            promotion.verify_staging_workflow(staging_metadata())

    def test_wrong_run_commit_branch_event_and_conclusion_rejected(self):
        for key, value in [
            ("head_sha", "b" * 40),
            ("head_branch", "feature"),
            ("event", "pull_request"),
            ("conclusion", "failure"),
            ("path", "different.yml"),
        ]:
            run = {**self.successful_run(), key: value}
            with (
                self.subTest(key=key),
                patch.object(promotion, "github_api", return_value=run),
                self.assertRaises(ValueError),
            ):
                promotion.verify_staging_workflow(staging_metadata())

    def test_downgrade_is_rejected(self):
        with (
            patch.object(
                promotion,
                "github_api",
                return_value=[[{"draft": False, "tag_name": "v0.2.0"}]],
            ),
            self.assertRaises(ValueError),
        ):
            promotion.reject_release_downgrade("v0.1.0")
        with patch.object(
            promotion,
            "github_api",
            return_value=[[{"draft": False, "tag_name": "v0.1.0-beta.1"}]],
        ):
            promotion.reject_release_downgrade("v0.1.0")

    def test_legacy_beta_without_immutability_is_rejected_before_download(self):
        with (
            patch.object(
                promotion,
                "find_release",
                return_value={"draft": False, "prerelease": True, "immutable": False},
            ),
            patch.object(promotion, "download_release") as download,
        ):
            with self.assertRaises(ValueError):
                promotion.load_verified_beta(BETA, Path("unused"))
            download.assert_not_called()


class ProductionHTTPTests(unittest.TestCase):
    def test_redirects_are_rejected_before_following(self):
        with self.assertRaisesRegex(ValueError, "redirects are forbidden"):
            verification.RejectProductionRedirects().redirect_request(
                None, None, 302, "Found", {}, "file:///etc/passwd"
            )

    def test_postdeploy_checks_exact_content_and_headers(self):
        files = staging_files()
        files["_headers"] = assets.PRODUCTION_HEADERS.encode()
        files["deployment.json"] = assets.json_bytes(
            {"version": "v0.1.0", "commit": COMMIT, "sourceBeta": BETA}
        )

        class Response:
            status = 200
            headers: ClassVar[dict[str, str]] = {"Cache-Control": "no-store"}

            def __init__(self, request):
                self.url = request.full_url
                path = verification.urllib.parse.urlsplit(self.url).path
                key = (
                    "index.html"
                    if path in ("/", "/memories/new", "/settings")
                    else path[1:]
                )
                self.body = files[key]

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, limit):
                return self.body[:limit]

        with patch.object(
            verification.urllib.request.OpenerDirector,
            "open",
            side_effect=lambda request, timeout: Response(request),
        ) as requests:
            verification.verify_production_site(files)
            self.assertEqual(requests.call_count, 6)
        Response.headers = {"X-Robots-Tag": "noindex"}
        with (
            patch.object(
                verification.urllib.request.OpenerDirector,
                "open",
                side_effect=lambda request, timeout: Response(request),
            ),
            patch.object(verification.time, "sleep"),
            self.assertRaisesRegex(ValueError, "noindex"),
        ):
            verification.verify_production_site(files)


if __name__ == "__main__":
    unittest.main()
