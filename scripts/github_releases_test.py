"""Regression tests for release creation and read-after-write visibility delays."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import github_releases as github
import publish_staging_release as staging
from release_assets import ASSET_NAMES, digest, verify_bundle
from release_assets_test import BETA, COMMIT, REPOSITORY, staging_files


@patch.dict(os.environ, {"GH_REPO": REPOSITORY})
class ReleaseVisibilityTests(unittest.TestCase):
    def setUp(self):
        command_guard = patch.object(
            github,
            "gh_command",
            side_effect=AssertionError(
                "Unexpected GitHub command in offline release test"
            ),
        )
        command_guard.start()
        self.addCleanup(command_guard.stop)

    def test_create_draft_returns_post_response_without_reading_list_again(self):
        for tag, prerelease in [(BETA, True), ("v0.1.0", False)]:
            draft = {
                "id": 123,
                "tag_name": tag,
                "target_commitish": COMMIT,
                "draft": True,
                "prerelease": prerelease,
                "assets": [],
            }
            with (
                self.subTest(tag=tag),
                patch.object(github, "check_tag_available"),
                patch.object(github, "find_release", return_value=None) as lookup,
                patch.object(github, "github_api", return_value=draft) as api,
            ):
                result = github.ensure_draft(tag, COMMIT, prerelease, "@literal\nnotes")
                self.assertIs(result, draft)
                lookup.assert_called_once_with(tag)
                api.assert_called_once_with(
                    f"repos/{REPOSITORY}/releases",
                    "--method",
                    "POST",
                    "--raw-field",
                    f"tag_name={tag}",
                    "--raw-field",
                    f"target_commitish={COMMIT}",
                    "--raw-field",
                    f"name={tag}",
                    "--raw-field",
                    "body=@literal\nnotes",
                    "--field",
                    "draft=true",
                    "--field",
                    f"prerelease={str(prerelease).lower()}",
                    "--raw-field",
                    "make_latest=false",
                )

    def test_staging_uploads_new_draft_even_when_list_still_reports_missing(self):
        draft = {
            "id": 123,
            "tag_name": BETA,
            "target_commitish": COMMIT,
            "draft": True,
            "prerelease": True,
            "assets": [],
        }
        environment = {
            "BETA_TAG": BETA,
            "GITHUB_SHA": COMMIT,
            "GITHUB_RUN_ID": "123",
            "GITHUB_RUN_ATTEMPT": "1",
            "STAGING_URL": "https://example.invalid",
        }

        uploaded = []

        def verify_upload(*arguments):
            self.assertEqual(arguments[0], "api")
            name = arguments[1].split("?name=")[1]
            self.assertEqual(
                arguments[1],
                f"https://uploads.github.com/repos/{REPOSITORY}/releases/123/assets?name={name}",
            )
            self.assertEqual(
                arguments[2:6],
                (
                    "--method",
                    "POST",
                    "--header",
                    "Content-Type: application/octet-stream",
                ),
            )
            self.assertEqual(arguments[6], "--input")
            path = Path(arguments[7])
            self.assertEqual(path.name, name)
            manifest, files = verify_bundle(path.parent)
            self.assertEqual(manifest["version"], BETA)
            self.assertEqual(files, staging_files())
            uploaded.append(name)

        with (
            patch.dict(os.environ, environment),
            patch.object(staging, "read_site", return_value=staging_files()),
            patch.object(github, "check_tag_available"),
            patch.object(github, "find_release", return_value=None) as lookup,
            patch.object(github, "github_api", return_value=draft),
            patch.object(github, "gh_command", side_effect=verify_upload) as upload,
            patch.object(staging, "publish_release") as publish,
        ):
            staging.publish_staging_release()
            lookup.assert_called_once_with(BETA)
            self.assertEqual(upload.call_count, len(ASSET_NAMES))
            self.assertEqual(set(uploaded), set(ASSET_NAMES))
            publish.assert_called_once()

    def test_existing_matching_draft_is_reused_without_creation(self):
        draft = {"draft": True, "target_commitish": COMMIT, "prerelease": True}
        with (
            patch.object(github, "check_tag_available"),
            patch.object(github, "find_release", return_value=draft),
            patch.object(github, "github_api") as api,
        ):
            self.assertIs(github.ensure_draft(BETA, COMMIT, True, "notes"), draft)
            api.assert_not_called()

    def test_invalid_creation_response_fails_explicitly(self):
        valid = {
            "draft": True,
            "target_commitish": COMMIT,
            "tag_name": BETA,
            "prerelease": True,
        }
        responses = [
            None,
            [],
            {},
            {**valid, "draft": False},
            {**valid, "target_commitish": "b" * 40},
            {**valid, "tag_name": "v0.2.0-beta.1"},
            {**valid, "prerelease": False},
        ]
        for response in responses:
            with (
                self.subTest(response=response),
                patch.object(github, "check_tag_available"),
                patch.object(github, "find_release", return_value=None),
                patch.object(github, "github_api", return_value=response),
                self.assertRaisesRegex(
                    ValueError, "unexpected draft creation response"
                ),
            ):
                github.ensure_draft(BETA, COMMIT, True, "notes")

    def test_failed_creation_is_not_retried_or_reinterpreted_as_success(self):
        with (
            patch.object(github, "check_tag_available"),
            patch.object(github, "find_release", return_value=None) as lookup,
            patch.object(
                github, "github_api", side_effect=subprocess.CalledProcessError(1, "gh")
            ) as api,
            self.assertRaises(subprocess.CalledProcessError),
        ):
            github.ensure_draft(BETA, COMMIT, True, "notes")
        api.assert_called_once()
        lookup.assert_called_once()

    def test_wait_for_release_retries_missing_results(self):
        draft = {"id": 123, "draft": True}
        with (
            patch.object(
                github, "find_release", side_effect=[None, None, draft]
            ) as lookup,
            patch.object(github.time, "sleep") as sleep,
        ):
            self.assertIs(github.wait_for_release(BETA), draft)
            self.assertEqual(lookup.call_count, 3)
            self.assertEqual(sleep.call_count, 2)

    def test_wait_for_release_has_bounded_retries_and_clear_error(self):
        with (
            patch.object(github, "find_release", return_value=None) as lookup,
            patch.object(github.time, "sleep") as sleep,
            self.assertRaisesRegex(
                ValueError, "required release not found after retries"
            ),
        ):
            github.wait_for_release(BETA)
        self.assertEqual(lookup.call_count, 6)
        self.assertEqual(sleep.call_count, 5)

    def test_wait_for_release_does_not_hide_api_permission_errors(self):
        with (
            patch.object(
                github,
                "find_release",
                side_effect=subprocess.CalledProcessError(1, "gh"),
            ) as lookup,
            patch.object(github.time, "sleep") as sleep,
            self.assertRaises(subprocess.CalledProcessError),
        ):
            github.wait_for_release(BETA)
        lookup.assert_called_once()
        sleep.assert_not_called()

    def test_missing_release_cannot_be_published(self):
        with (
            patch.object(github, "find_release", return_value=None),
            patch.object(github.time, "sleep"),
            patch.object(github, "gh_command") as command,
            self.assertRaisesRegex(ValueError, "required release not found"),
        ):
            github.publish_release(BETA, COMMIT, Path("unused"), True)
        command.assert_not_called()

    def test_publication_tolerates_missing_list_results_before_and_after_edit(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in ASSET_NAMES:
                (directory / name).write_bytes(b"data")
            draft = {
                "id": 123,
                "tag_name": BETA,
                "draft": True,
                "target_commitish": COMMIT,
                "prerelease": True,
                "assets": [
                    {
                        "name": name,
                        "digest": f"sha256:{digest(b'data')}",
                        "state": "uploaded",
                    }
                    for name in ASSET_NAMES
                ],
            }
            published = {
                "html_url": "https://example.invalid/release",
                "draft": False,
                "immutable": True,
            }
            with (
                patch.object(
                    github, "find_release", side_effect=[None, draft, None, published]
                ),
                patch.object(
                    github, "github_api", side_effect=[{**draft, "assets": []}, draft]
                ) as api,
                patch.object(github, "check_tag_available"),
                patch.object(github, "verify_tag_commit"),
                patch.object(github, "verify_immutable_release") as verify,
                patch.object(github, "gh_command") as command,
                patch.object(github.time, "sleep") as sleep,
            ):
                github.publish_release(BETA, COMMIT, directory, True)
                command.assert_called_once()
                self.assertIn("--draft=false", command.call_args.args)
                verify.assert_called_once_with(published, directory)
                self.assertEqual(sleep.call_count, 3)
                self.assertTrue(
                    all(
                        call.args == (f"repos/{REPOSITORY}/releases/123",)
                        for call in api.call_args_list
                    )
                )

    def test_release_assets_never_matching_fail_without_publishing(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in ASSET_NAMES:
                (directory / name).write_bytes(b"data")
            valid = [
                {
                    "name": name,
                    "digest": f"sha256:{digest(b'data')}",
                    "state": "uploaded",
                }
                for name in ASSET_NAMES
            ]
            for assets in [
                [],
                valid[:-1],
                valid + [valid[0]],
                [{**asset, "digest": "sha256:wrong"} for asset in valid],
                [{**asset, "state": "starter"} for asset in valid],
            ]:
                with (
                    self.subTest(assets=assets),
                    patch.object(
                        github,
                        "wait_for_release",
                        return_value={
                            "id": 123,
                            "draft": True,
                            "target_commitish": COMMIT,
                            "prerelease": True,
                        },
                    ),
                    patch.object(github, "check_tag_available"),
                    patch.object(
                        github, "github_api", return_value={"assets": assets}
                    ) as api,
                    patch.object(github.time, "sleep"),
                    self.assertRaisesRegex(
                        ValueError, "assets are incomplete or differ"
                    ),
                ):
                    github.publish_release(BETA, COMMIT, directory, True)
                self.assertEqual(api.call_count, 6)
                self.assertTrue(all(len(call.args) == 1 for call in api.call_args_list))

    def test_release_assets_api_errors_are_not_retried(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            for name in ASSET_NAMES:
                (directory / name).write_bytes(b"data")
            with (
                patch.object(
                    github,
                    "github_api",
                    side_effect=subprocess.CalledProcessError(1, "gh"),
                ) as api,
                patch.object(github.time, "sleep") as sleep,
                self.assertRaises(subprocess.CalledProcessError),
            ):
                github.wait_for_release_assets({"id": 123}, directory)
            api.assert_called_once()
            sleep.assert_not_called()

    def test_missing_release_after_publication_does_not_repeat_publication(self):
        with (
            patch.object(
                github, "find_release", side_effect=[{"draft": False}] + [None] * 6
            ),
            patch.object(github, "check_tag_available"),
            patch.object(github.time, "sleep") as sleep,
            patch.object(github, "gh_command") as command,
            self.assertRaisesRegex(ValueError, "published release is not visible yet"),
        ):
            github.publish_release(BETA, COMMIT, Path("unused"), True)
        command.assert_not_called()
        self.assertEqual(sleep.call_count, 5)


if __name__ == "__main__":
    unittest.main()
