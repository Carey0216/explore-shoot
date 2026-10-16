"""Backport only render-blocking stylesheet links onto a checked, immutable v6.9.0 copy.

No new JAR, configuration, data import, SQL migration or model installation is accepted.
Run only for the user's specifically approved v6.10.1 startup-style hotfix.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import time
import urllib.request

RULES = {
    "user": ("/shared/polish.css", "/visual.css", "/shared/liquid.css", "/theme.css"),
    "admin": ("/shared/polish.css", "/visual.css", "/shared/liquid.css", "/mobile-nav.css"),
}
BASE_COMMIT = "970c17b694c933af2f391b4e5706176611eeb964"
BASE_JAR = "124a5b5318208cd117595568788ba6d26c442dd7209a8d5badb07977fe67d7b8"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def patch_html(original, audience):
    text = original.decode("utf-8")
    for href in RULES[audience]:
        old = f'<link rel="stylesheet" href="{href}" media="print" onload="this.media = \'all\'" />'
        if text.count(old) != 1:
            raise ValueError("Unexpected stylesheet markup: " + href)
        text = text.replace(old, f'<link rel="stylesheet" href="{href}" />', 1)
    return text.encode("utf-8")


def verify_release(directory, manifest):
    root = directory.resolve()
    for entry in manifest["files"]:
        relative = Path(entry["path"])
        path = directory / relative
        if relative.is_absolute() or not path.resolve().is_relative_to(root) or path.is_symlink():
            raise ValueError("Unsafe manifest path")
        if digest(path) != entry["sha256"]:
            raise ValueError("Immutable program checksum mismatch: " + entry["path"])
    if digest(directory / "backend/target/explore-shoot-backend.jar") != manifest["jarSHA256"]:
        raise ValueError("Backend checksum mismatch")
    # Do not follow the large, shared voice runtime into a copied release.
    for path in directory.rglob("*"):
        if path.is_symlink() and not (
            path.relative_to(directory).as_posix() == "tools/bin"
            and os.readlink(path) == "/var/lib/explore-shoot/runtime/tools-bin"
        ):
            raise ValueError("Unexpected program symlink")


def stage_release(source, destination, commit):
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("Fixed patch source commit required")
    manifest = json.loads((source / "deployment-manifest.json").read_text(encoding="utf-8-sig"))
    if manifest["release"] != "6.9.0" or manifest["sourceCommit"] != BASE_COMMIT:
        raise ValueError("Hotfix only supports the verified v6.9.0 base")
    if manifest["jarSHA256"] != BASE_JAR or manifest.get("staticHotfix"):
        raise ValueError("Unexpected backend or already patched release")
    if manifest.get("environment") != "pilot" or manifest.get("dataIncluded") is not False or manifest.get("modelsIncluded") is not False:
        raise ValueError("Unexpected environment or private data in the program snapshot")
    verify_release(source, manifest)
    changes = {f"dist/{audience}/index.html": patch_html((source / f"dist/{audience}/index.html").read_bytes(), audience)
               for audience in RULES}
    shutil.copytree(source, destination, symlinks=True)
    for name, content in changes.items():
        (destination / name).write_bytes(content)
    recorded = {entry["path"]: entry for entry in manifest["files"]}
    for name in changes:
        recorded[name]["sha256"] = digest(destination / name)
    manifest["staticHotfix"] = {
        "id": "startup-style-v6.10.1", "sourceCommit": commit,
        "baseRelease": "6.9.0", "changedFiles": sorted(changes),
        "stylesheetLinks": 8, "backendChanged": False, "dataImported": False,
    }
    (destination / "deployment-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    verify_release(destination, manifest)
    return manifest


def health(port):
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/health", timeout=2) as response:
        return json.load(response)


def wait_healthy():
    for _ in range(45):
        try:
            both = [health(4174), health(4176)]
            if all(h["release"] == "6.9.0" and h["build"] == BASE_JAR for h in both) and both[1]["audience"] == "admin":
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("Original backend health did not recover")


def switch(root, target):
    temporary = root / "current.startup-next"
    if temporary.exists() or temporary.is_symlink():
        raise RuntimeError("A pending program switch already exists")
    temporary.symlink_to(target, target_is_directory=True)
    temporary.replace(root / "current")


def apply(commit):
    if os.geteuid() != 0:
        raise RuntimeError("Root is required for the approved service switch")
    root = Path("/opt/explore-shoot")
    source = (root / "current").resolve(strict=True)
    if source.parent != (root / "releases").resolve():
        raise RuntimeError("Unexpected active release path")
    data = Path("/var/lib/explore-shoot/data")
    if (data / "campus.mv.db").exists() or not (data / "store-v2.json").is_file():
        raise RuntimeError("Expected JSON data; no SQL upgrade is permitted")
    stamp = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    target = root / "releases" / ("v6.9.0-startup-v6.10.1-" + commit[:8])
    if target.exists():
        raise RuntimeError("Immutable hotfix target already exists")
    current = health(4174)
    if current["release"] != "6.9.0" or current["build"] != BASE_JAR:
        raise RuntimeError("Live service differs from the approved base")
    stage_release(source, target, commit)
    subprocess.run(["systemctl", "stop", "explore-shoot.service"], check=True)
    backup = Path("/var/backups/explore-shoot") / ("before-startup-v6.10.1-" + stamp + ".tar.gz")
    try:
        os.umask(0o077)
        files = [p for p in data.rglob("*") if p.is_file() and p.name != ".java-backend.lock"]
        if any(p.is_symlink() for p in data.rglob("*")):
            raise RuntimeError("Unexpected symlink in data backup")
        hashes = {p.relative_to(data).as_posix(): digest(p) for p in files}
        with tarfile.open(backup, "x:gz") as archive:
            for path in files:
                archive.add(path, arcname=path.relative_to(data).as_posix(), recursive=False)
        with tarfile.open(backup, "r:gz") as archive:
            for name, expected in hashes.items():
                if hashlib.sha256(archive.extractfile(name).read()).hexdigest() != expected:
                    raise RuntimeError("Data backup failed verification")
        backup.with_suffix(backup.suffix + ".sha256").write_text(digest(backup) + "  " + backup.name + "\n")
        switch(root, target)
        subprocess.run(["systemctl", "start", "explore-shoot.service"], check=True)
        wait_healthy()
        unchanged = [name for name, sha in hashes.items() if (data / name).is_file() and digest(data / name) == sha]
        if (data / "campus.mv.db").exists():
            raise RuntimeError("SQL migration was not allowed")
        print(json.dumps({"active": str(target), "previous": str(source), "backup": str(backup),
                          "backupFiles": len(files), "unchangedDataFiles": len(unchanged),
                          "release": "6.9.0", "backendBuild": BASE_JAR,
                          "staticHotfix": "startup-style-v6.10.1", "patchCommit": commit}))
    except BaseException:
        subprocess.run(["systemctl", "stop", "explore-shoot.service"], check=False)
        if (root / "current").resolve() != source:
            switch(root, source)
        subprocess.run(["systemctl", "start", "explore-shoot.service"], check=False)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()
    apply(args.commit)
