"""Deterministic, static-only release bundles; no build commands run during promotion."""

import gzip
import hashlib
import io
import json
import re
import tarfile
from pathlib import Path, PurePosixPath

ASSET_NAMES = ("site.tar.gz", "manifest.json", "SHA256SUMS")
STAGING_HEADERS = "/*\n  X-Robots-Tag: noindex, nofollow\n/deployment.json\n  Cache-Control: no-store\n"
PRODUCTION_HEADERS = "/deployment.json\n  Cache-Control: no-store\n"
PRODUCTION_URL = "https://gakumas-produce-memory-deck.pages.dev"
MAX_BUNDLE_BYTES = 200 * 1024 * 1024
MAX_FILES = 10000


def stable_version(beta):
    """Derive a stable version only from a canonical vX.Y.Z-beta.N tag."""
    match = re.fullmatch(
        r"(v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))-beta\.(?:0|[1-9][0-9]*)",
        beta,
    )
    if not match:
        raise ValueError("Release promotion: invalid beta version")
    return match[1]


def digest(data):
    """Return a SHA-256 hex digest of exact asset bytes."""
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    """Serialize manifests deterministically across retries."""
    return (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()


def validate_asset_path(name):
    """Reject traversal, hidden paths and executable Pages entry points."""
    path = PurePosixPath(name)
    if (
        not name
        or str(path) != name
        or path.is_absolute()
        or "\\" in name
        or any(part in (".", "..") or part.startswith(".") for part in path.parts)
        or any(ord(char) < 32 for char in name)
        or path.parts[0] == "functions"
        or path.name in ("_worker.js", "404.html")
        or path.name.startswith("wrangler.")
    ):
        raise ValueError(f"Release bundle: unsafe static asset path: {name!r}")


def read_site(directory):
    """Read regular static files only; symlinks are never followed."""
    files = {}
    for path in sorted(Path(directory).rglob("*")):
        if path.is_symlink():
            raise ValueError("Release bundle: symlinks are forbidden")
        if path.is_file():
            name = path.relative_to(directory).as_posix()
            validate_asset_path(name)
            files[name] = path.read_bytes()
        elif not path.is_dir():
            raise ValueError("Release bundle: special files are forbidden")
    validate_site_limits(files)
    return files


def validate_site_limits(files):
    """Bound bundle size and require the site's entry point and deployment metadata."""
    if not {"index.html", "deployment.json", "_headers"} <= files.keys():
        raise ValueError("Release bundle: missing required site files")
    if len(files) > MAX_FILES or sum(map(len, files.values())) > MAX_BUNDLE_BYTES:
        raise ValueError("Release bundle: static site exceeds safety limits")


def archive_site(files):
    """Create reproducible gzip/tar bytes independent of local file timestamps."""
    validate_site_limits(files)
    output = io.BytesIO()
    with (
        gzip.GzipFile(fileobj=output, mode="wb", mtime=0, filename="") as compressed,
        tarfile.open(fileobj=compressed, mode="w") as archive,
    ):
        for name, data in sorted(files.items()):
            validate_asset_path(name)
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            entry.mode = 0o644
            archive.addfile(entry, io.BytesIO(data))
    return output.getvalue()


def unpack_site(data):
    """Decode a bounded archive in memory without tarfile.extract or filesystem writes."""
    if len(data) > MAX_BUNDLE_BYTES:
        raise ValueError("Release bundle: compressed archive exceeds safety limit")
    # Bound decompression before tar parsing, including oversized PAX headers and padding.
    tar_limit = MAX_BUNDLE_BYTES + MAX_FILES * 1024 + 10240
    with gzip.GzipFile(fileobj=io.BytesIO(data), mode="rb") as compressed:
        tar_bytes = compressed.read(tar_limit + 1)
    if len(tar_bytes) > tar_limit:
        raise ValueError("Release bundle: decompressed archive exceeds safety limit")
    files = {}
    total = 0
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:") as archive:
        for entry in archive:
            validate_asset_path(entry.name)
            total += entry.size
            if (
                not entry.isfile()
                or entry.name in files
                or entry.size < 0
                or total > MAX_BUNDLE_BYTES
                or len(files) >= MAX_FILES
            ):
                raise ValueError("Release bundle: invalid archive entry or size")
            files[entry.name] = archive.extractfile(entry).read()
    validate_site_limits(files)
    return files


def write_bundle(directory, files, metadata):
    """Write the three release assets, including per-file and archive hashes."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    archive = archive_site(files)
    manifest = {
        **metadata,
        "schemaVersion": 1,
        "archiveSha256": digest(archive),
        "files": {name: digest(data) for name, data in sorted(files.items())},
    }
    (directory / "site.tar.gz").write_bytes(archive)
    (directory / "manifest.json").write_bytes(json_bytes(manifest))
    write_checksums(directory)
    return manifest


def write_checksums(directory):
    """Hash the bundle and manifest; the checksum file is itself attested by GitHub."""
    directory = Path(directory)
    (directory / "SHA256SUMS").write_text(
        "".join(
            f"{digest((directory / name).read_bytes())}  {name}\n"
            for name in ASSET_NAMES[:2]
        )
    )


def verify_bundle(directory):
    """Verify exact asset inventory, checksums, manifest schema and archive contents."""
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_bytes())
    if manifest.get("schemaVersion") != 1:
        raise ValueError("Release bundle: unsupported manifest schema")
    if not re.fullmatch(r"[0-9a-f]{40}", manifest.get("commit", "")):
        raise ValueError("Release bundle: invalid commit SHA")
    expected = "".join(
        f"{digest((directory / name).read_bytes())}  {name}\n"
        for name in ASSET_NAMES[:2]
    )
    if (directory / "SHA256SUMS").read_text() != expected:
        raise ValueError("Release bundle: checksum mismatch")
    archive = (directory / "site.tar.gz").read_bytes()
    if digest(archive) != manifest.get("archiveSha256"):
        raise ValueError("Release bundle: archive digest mismatch")
    files = unpack_site(archive)
    if {name: digest(data) for name, data in files.items()} != manifest.get("files"):
        raise ValueError("Release bundle: file inventory mismatch")
    return manifest, files


def promote_site(files, manifest, beta_release_id):
    """Change only deployment.json and staging noindex headers; preserve application bytes."""
    beta = manifest["version"]
    version = stable_version(beta)
    if manifest.get("environment") != "staging":
        raise ValueError("Release promotion: expected staging manifest")
    if json.loads(files["deployment.json"]) != {
        "commit": manifest["commit"],
        "version": beta,
    }:
        raise ValueError("Release promotion: staging deployment metadata mismatch")
    if files["_headers"] != STAGING_HEADERS.encode():
        raise ValueError("Release promotion: unexpected staging headers")
    promoted = dict(files)
    promoted["_headers"] = PRODUCTION_HEADERS.encode()
    promoted["deployment.json"] = json_bytes(
        {
            "commit": manifest["commit"],
            "version": version,
            "sourceBeta": beta,
        }
    )
    metadata = {
        "environment": "production",
        "version": version,
        "commit": manifest["commit"],
        "sourceBeta": beta,
        "sourceReleaseId": beta_release_id,
        "sourceArchiveSha256": manifest["archiveSha256"],
        "sourceWorkflow": manifest["workflow"],
    }
    return promoted, metadata


def materialize_site(directory, files):
    """Write validated static files into a fresh directory, never over an existing tree."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=False)
    for name, data in files.items():
        validate_asset_path(name)
        destination = directory / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
