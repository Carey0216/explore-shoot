"""Offline comparison against the stopped server's backup; never imports local business data."""
import json
import pathlib
import sys
import tarfile


def verify(before, after, username):
    for key, value in before.items():
        if key in ('admins', 'audit'):
            continue
        assert after.get(key) == value, 'Migration changed existing collection: ' + key
    old_admins = before.get('admins', [])
    new_admins = after.get('admins', [])
    assert all(row in new_admins for row in old_admins), 'Existing administrator changed'
    extra = [row for row in new_admins if row not in old_admins]
    assert len(extra) == 1 and len(new_admins) == len(old_admins) + 1
    assert extra[0]['role'] == 'owner' and extra[0]['username'] == username
    assert sum(row.get('role') == 'owner' for row in new_admins) == 1
    old_audit, new_audit = before.get('audit', []), after.get('audit', [])
    added = [row for row in new_audit if row not in old_audit]
    assert len(added) == 1 and added[0]['action'] == '初始化唯一顶级管理员'
    # Same bounded audit retention as StoreRepository.audit; all other records are exact.
    expected = old_audit + added
    routine = [row for row in expected if row.get('action') != '永久删除内容']
    trimmed = routine[:max(0, len(routine) - 3000)]
    assert new_audit == [row for row in expected if row not in trimmed]


def main():
    backup, exported, username, data = sys.argv[1:]
    data = pathlib.Path(data).resolve()
    after = json.loads(pathlib.Path(exported).read_text(encoding='utf-8-sig'))
    media = 0
    with tarfile.open(backup, 'r:gz') as archive:
        before = json.load(archive.extractfile('./store-v2.json'))
        verify(before, after, username)
        for member in archive.getmembers():
            if member.isfile() and member.name.startswith(('./media/', './avatars/')):
                path = (data / member.name).resolve()
                assert path.is_relative_to(data) and path.read_bytes() == archive.extractfile(member).read(), 'Media changed during migration'
                media += 1
    print('PASS cloud migration: all existing business fields and settings retained; unique owner added; media files verified:', media)


if __name__ == '__main__':
    main()
