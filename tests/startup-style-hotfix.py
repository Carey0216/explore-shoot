import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hotfix", ROOT / "tools/deploy/startup_style_hotfix.py")
hotfix = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hotfix)


class StartupHotfixTest(unittest.TestCase):
    def test_staging_changes_only_html_and_manifest_and_keeps_original_program(self):
        runs = ROOT / 'tests/.runs'
        runs.mkdir(exist_ok=True)
        folder = Path(tempfile.mkdtemp(prefix='hotfix-fixture-', dir=runs)).resolve()
        try:
            source = folder / 'original'
            jar = source / 'backend/target/explore-shoot-backend.jar'
            jar.parent.mkdir(parents=True)
            jar.write_bytes(b'UNMODIFIED_BACKEND_FIXTURE')
            for audience in hotfix.RULES:
                destination = source / f'dist/{audience}/index.html'
                destination.parent.mkdir(parents=True)
                destination.write_bytes(subprocess.check_output(['git', '-c', 'safe.directory=' + str(ROOT).replace('\\', '/'), 'show', f'v6.9.0:dist/{audience}/index.html'], cwd=ROOT))
            files = {p.relative_to(source).as_posix(): p.read_bytes() for p in source.rglob('*') if p.is_file()}
            manifest = {'release': '6.9.0', 'sourceCommit': hotfix.BASE_COMMIT, 'jarSHA256': hotfix.digest(jar),
                        'environment': 'pilot', 'dataIncluded': False, 'modelsIncluded': False,
                        'files': [{'path': name, 'sha256': hotfix.digest(source/name)} for name in files]}
            (source/'deployment-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
            with patch.object(hotfix, 'BASE_JAR', hotfix.digest(jar)):
                staged = hotfix.stage_release(source, folder/'patched', 'a'*40)
            self.assertEqual(staged['sourceCommit'], hotfix.BASE_COMMIT)
            self.assertEqual(staged['staticHotfix']['stylesheetLinks'], 8)
            self.assertFalse(staged['staticHotfix']['backendChanged'])
            for name, before in files.items():
                self.assertEqual((source/name).read_bytes(), before)
                if not name.endswith('index.html'):
                    self.assertEqual((folder/'patched'/name).read_bytes(), before)
            jar.write_bytes(b'TAMPERED_BACKEND')
            with self.assertRaises(ValueError):
                hotfix.verify_release(source, manifest)
        finally:
            assert folder.parent == runs.resolve() and folder.name.startswith('hotfix-fixture-')
            shutil.rmtree(folder)

    def test_exact_legacy_html_backport_preserves_all_other_bytes(self):
        for audience in hotfix.RULES:
            path = f"dist/{audience}/index.html"
            original = subprocess.check_output(["git", "-c", "safe.directory=" + str(ROOT).replace("\\", "/"), "show", "v6.9.0:" + path], cwd=ROOT)
            changed = hotfix.patch_html(original, audience)
            restored = changed
            for href in hotfix.RULES[audience]:
                old = f'<link rel="stylesheet" href="{href}" />'
                self.assertEqual(changed.count(old.encode()), 1)
                restored = restored.replace(old.encode(), f'<link rel="stylesheet" href="{href}" media="print" onload="this.media = \'all\'" />'.encode(), 1)
            self.assertEqual(original, restored)
            self.assertIn(b"v6.9", changed) if audience == "user" else None

    def test_changed_or_already_patched_markup_fails_closed(self):
        with self.assertRaises(ValueError):
            hotfix.patch_html(b"<html>unexpected content</html>", "user")
        data = '\n'.join(f'<link rel="stylesheet" href="{href}" media="print" onload="this.media = \'all\'" />' for href in hotfix.RULES["user"]).encode()
        with self.assertRaises(ValueError):
            hotfix.patch_html(hotfix.patch_html(data, "user"), "user")


if __name__ == "__main__":
    unittest.main()
