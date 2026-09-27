"""Offline workflow-level checks using real bundles and a simulated release asset store."""

import json
import os
import shutil
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

import promote_production_release as promotion
import publish_staging_release as staging
import release_assets as assets
from release_assets_test import (
    BETA,
    COMMIT,
    REPOSITORY,
    staging_files,
    staging_metadata,
)


@patch.dict(os.environ, {"GH_REPO": REPOSITORY, "GITHUB_RUN_ID": "456"})
class ProductionPromotionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source_manifest = assets.write_bundle(
            self.root / "beta", staging_files(), staging_metadata()
        )
        self.release = {
            "draft": True,
            "html_url": "https://example/release",
            "assets": [],
        }
        self.store = self.root / "store"
        self.store.mkdir()
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(
            patch.object(promotion, "PRODUCTION_DIRECTORY", self.root / "production")
        )
        self.stack.enter_context(
            patch.object(
                promotion,
                "load_verified_beta",
                return_value=({"id": 42}, self.source_manifest, staging_files()),
            )
        )
        self.stack.enter_context(patch.object(promotion, "reject_release_downgrade"))
        self.stack.enter_context(
            patch.object(promotion, "ensure_draft", return_value=self.release)
        )
        self.stack.enter_context(
            patch.object(
                promotion, "wait_for_release_assets", return_value=self.release
            )
        )
        self.tag_check = self.stack.enter_context(
            patch.object(promotion, "verify_tag_commit")
        )
        self.attestation = self.stack.enter_context(
            patch.object(promotion, "verify_immutable_release")
        )
        self.outputs = self.stack.enter_context(patch.object(promotion, "emit_outputs"))
        self.stack.enter_context(
            patch.object(promotion, "download_release", side_effect=self.download)
        )
        self.upload = self.stack.enter_context(
            patch.object(
                promotion, "upload_missing_assets", side_effect=self.upload_assets
            )
        )

    def download(self, release, destination, require_complete=True):
        destination.mkdir(parents=True, exist_ok=True)
        for file in self.store.iterdir():
            shutil.copyfile(file, destination / file.name)

    def upload_assets(self, release, directory):
        for name in assets.ASSET_NAMES:
            shutil.copyfile(directory / name, self.store / name)

    def test_prepares_verified_draft_and_uses_production_config(self):
        promotion.prepare_production_release(BETA)
        manifest, files = assets.verify_bundle(self.root / "production/verified")
        self.assertEqual(manifest["sourceBeta"], BETA)
        self.assertEqual(manifest["version"], "v0.1.0")
        self.assertEqual(assets.read_site(self.root / "production/site"), files)
        config = json.loads((self.root / "production/wrangler.jsonc").read_text())
        self.assertEqual(config["name"], "gakumas-produce-memory-deck")
        self.outputs.assert_called_once_with("v0.1.0", COMMIT, False)

    def test_inspection_does_not_create_draft_or_upload(self):
        promotion.prepare_production_release(BETA, inspect_only=True)
        self.upload.assert_not_called()
        self.assertFalse((self.root / "production").exists())

    def test_already_published_release_is_verified_without_deploy(self):
        promoted, metadata = assets.promote_site(
            staging_files(), self.source_manifest, 42
        )
        assets.write_bundle(self.store, promoted, metadata)
        self.release["draft"] = False
        promotion.prepare_production_release(BETA)
        self.attestation.assert_called_once()
        self.upload.assert_not_called()
        self.outputs.assert_called_once_with("v0.1.0", COMMIT, True)
        self.assertFalse((self.root / "production/site").exists())

    def test_different_beta_cannot_replace_same_stable_version(self):
        promoted, metadata = assets.promote_site(
            staging_files(), self.source_manifest, 42
        )
        metadata["sourceBeta"] = "v0.1.0-beta.99"
        assets.write_bundle(self.store, promoted, metadata)
        with self.assertRaisesRegex(ValueError, "different beta assets"):
            promotion.prepare_production_release(BETA)
        self.upload.assert_not_called()

    def test_corrupted_uploaded_asset_is_rejected_before_materializing(self):
        def corrupt(release, directory):
            self.upload_assets(release, directory)
            (self.store / "site.tar.gz").write_bytes(b"corrupt")

        self.upload.side_effect = corrupt
        with self.assertRaisesRegex(ValueError, "checksum"):
            promotion.prepare_production_release(BETA)
        self.assertFalse((self.root / "production/site").exists())

    def test_missing_uploaded_release_stops_before_deployment_files_are_written(self):
        with (
            patch.object(
                promotion,
                "wait_for_release_assets",
                side_effect=ValueError("release not visible"),
            ),
            self.assertRaisesRegex(ValueError, "release not visible"),
        ):
            promotion.prepare_production_release(BETA)
        self.assertFalse((self.root / "production/site").exists())
        self.outputs.assert_not_called()

    def test_failed_postdeploy_check_does_not_publish(self):
        promotion.prepare_production_release(BETA)
        with (
            patch.object(
                promotion,
                "verify_production_site",
                side_effect=ValueError("wrong version"),
            ),
            patch.object(promotion, "publish_release") as publish,
        ):
            with self.assertRaises(ValueError):
                promotion.finalize_production_release(BETA)
            publish.assert_not_called()

    def test_successful_postdeploy_check_publishes_stable_release(self):
        promotion.prepare_production_release(BETA)
        with (
            patch.object(promotion, "verify_production_site") as verify,
            patch.object(promotion, "publish_release") as publish,
        ):
            promotion.finalize_production_release(BETA)
            verify.assert_called_once()
            self.assertFalse(publish.call_args.kwargs["prerelease"])


class StagingDraftTests(unittest.TestCase):
    def test_retry_preserves_original_smoke_attempt_and_asset_bytes(self):
        with tempfile.TemporaryDirectory() as temporary, ExitStack() as stack:
            root = Path(temporary)
            manifest = assets.write_bundle(
                root / "old", staging_files(), staging_metadata()
            )
            environment = {
                "BETA_TAG": BETA,
                "GITHUB_SHA": COMMIT,
                "GH_REPO": REPOSITORY,
                "GITHUB_RUN_ID": "123",
                "GITHUB_RUN_ATTEMPT": "2",
                "STAGING_URL": "https://gakumas-produce-memory-deck-staging.pages.dev",
            }
            stack.enter_context(patch.dict(os.environ, environment))
            stack.enter_context(
                patch.object(staging, "read_site", return_value=staging_files())
            )
            stack.enter_context(
                patch.object(staging, "ensure_draft", return_value={"draft": True})
            )

            def download(release, destination, require_complete):
                shutil.copytree(root / "old", destination)

            stack.enter_context(
                patch.object(staging, "download_release", side_effect=download)
            )

            def upload(release, directory):
                self.assertEqual(assets.verify_bundle(directory)[0], manifest)
                for name in assets.ASSET_NAMES:
                    self.assertEqual(
                        (directory / name).read_bytes(),
                        (root / "old" / name).read_bytes(),
                    )

            upload_mock = stack.enter_context(
                patch.object(staging, "upload_missing_assets", side_effect=upload)
            )
            publish = stack.enter_context(patch.object(staging, "publish_release"))
            staging.publish_staging_release()
            upload_mock.assert_called_once()
            publish.assert_called_once()


if __name__ == "__main__":
    unittest.main()
