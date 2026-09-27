"""Post-deployment HTTP checks only; this module never builds or runs application tests."""

import json
import time
import urllib.error
import urllib.parse
import urllib.request

from release_assets import PRODUCTION_URL


class RejectProductionRedirects(urllib.request.HTTPRedirectHandler):
    """Do not follow redirects away from the exact production URLs being verified."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Production verification: redirects are forbidden")


def verify_production_site(files):
    """Require the expected version, SPA HTML, one JS/image and production headers."""
    stamp = json.loads(files["deployment.json"])
    opener = urllib.request.build_opener(RejectProductionRedirects())
    scripts = sorted(
        name for name in files if name.startswith("assets/") and name.endswith(".js")
    )
    images = sorted(
        name
        for name in files
        if name.startswith("skill-card-icons/") and name.endswith(".webp")
    )
    if not scripts or not images:
        raise ValueError("Production verification: bundle has no JS or card images")
    paths = {
        "/": "index.html",
        "/memories/new": "index.html",
        "/settings": "index.html",
        "/deployment.json": "deployment.json",
        f"/{scripts[0]}": scripts[0],
        f"/{images[0]}": images[0],
    }
    for attempt in range(12):
        try:
            for path, asset in paths.items():
                url = (
                    PRODUCTION_URL
                    + urllib.parse.quote(path, safe="/")
                    + "?"
                    + urllib.parse.urlencode(
                        {
                            "release": stamp["version"],
                            "commit": stamp["commit"],
                            "attempt": attempt,
                        }
                    )
                )
                request = urllib.request.Request(
                    url,
                    headers={
                        # Cloudflare rejects the default Python-urllib User-Agent.
                        "User-Agent": "gakumas-production-verifier/1.0",
                        "Cache-Control": "no-cache",
                        "Accept": "text/html,*/*",
                    },
                )
                # Only the fixed production origin is used; redirects are blocked before following.
                with opener.open(request, timeout=15) as response:
                    if (
                        urllib.parse.urlsplit(response.url).netloc
                        != urllib.parse.urlsplit(PRODUCTION_URL).netloc
                    ):
                        raise ValueError(
                            "Production verification: redirected to a different host"
                        )
                    if (
                        response.status != 200
                        or response.read(len(files[asset]) + 1) != files[asset]
                    ):
                        raise ValueError(
                            f"Production verification: unexpected content at {path}"
                        )
                    if "noindex" in response.headers.get("X-Robots-Tag", "").lower():
                        raise ValueError(
                            "Production verification: staging noindex header remains"
                        )
                    if (
                        path == "/deployment.json"
                        and "no-store" not in response.headers.get("Cache-Control", "")
                    ):
                        raise ValueError(
                            "Production verification: metadata cache policy is missing"
                        )
            print(f"Production HTTP verification passed: {stamp['version']}")
            return
        except (ValueError, urllib.error.URLError, TimeoutError):
            if attempt == 11:
                raise
            time.sleep(5)
