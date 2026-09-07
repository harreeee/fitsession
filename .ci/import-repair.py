"""Import the reviewed repair, refusing any unexpected input or source drift."""
import argparse
import base64
import hashlib
import json
import lzma
import os
from pathlib import Path

EXPECTED = 'c5a53b8eec0bb408026904d8c3fd1a5fbbb20a745a1e1707e95975d308c58d05'
BRANCH = 'repair/core-booking-20260907'
ROOT = Path(__file__).resolve().parents[1]
TRANSFER = ROOT / '.ci' / 'repair-transfer'

def digest(value):
    return hashlib.sha256(value).hexdigest()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if os.environ.get('GITHUB_ACTIONS') == 'true':
        if os.environ.get('GITHUB_EVENT_NAME') != 'push' or os.environ.get('GITHUB_REF') != 'refs/heads/' + BRANCH:
            raise SystemExit('Refusing import outside the authorized repair-branch push.')
    index = json.loads((TRANSFER / 'index.json').read_text())
    if index['decoded_sha256'] != EXPECTED or index['files'] != 51:
        raise SystemExit('Unexpected repair manifest.')
    encoded = b''
    for number, chunk in enumerate(index['chunks']):
        if chunk['name'] != f'manifest-{number:02d}.b64':
            raise SystemExit('Invalid transfer sequence.')
        value = (TRANSFER / chunk['name']).read_bytes()
        if len(value) != chunk['bytes'] or digest(value) != chunk['sha256']:
            raise SystemExit('Transfer checksum mismatch: ' + chunk['name'])
        encoded += value
    decoded = lzma.decompress(base64.b64decode(encoded, validate=True))
    if digest(decoded) != EXPECTED:
        raise SystemExit('Decoded manifest checksum mismatch.')
    entries = json.loads(decoded)
    if len(entries) != 51:
        raise SystemExit('Wrong number of repair files.')
    planned = []
    paths = set()
    for entry in entries:
        relative = Path(entry['path'])
        if relative.is_absolute() or '..' in relative.parts or entry['path'] in paths:
            raise SystemExit('Unsafe or duplicate path.')
        if not (relative.parts[0] in ('app', 'lib', 'components', 'docs', 'supabase', 'tests') or entry['path'] == 'package.json'):
            raise SystemExit('Unexpected target: ' + entry['path'])
        paths.add(entry['path'])
        target = ROOT / relative
        if target.is_symlink() or not target.resolve().is_relative_to(ROOT):
            raise SystemExit('Symlink target refused.')
        before = target.read_bytes() if target.exists() else b''
        if digest(before) == entry['after']:
            continue
        if digest(before) != entry['before']:
            raise SystemExit('Source has diverged: ' + entry['path'])
        lines = before.decode('utf-8').splitlines(keepends=True)
        for start, end, text in reversed(entry['ops']):
            if not 0 <= start <= end <= len(lines):
                raise SystemExit('Invalid edit bounds.')
            lines[start:end] = [text]
        after = ''.join(lines).encode('utf-8')
        if digest(after) != entry['after']:
            raise SystemExit('Output checksum mismatch: ' + entry['path'])
        planned.append((target, after))
    if args.apply:
        for target, value in planned:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(value)
        for entry in entries:
            if digest((ROOT / entry['path']).read_bytes()) != entry['after']:
                raise SystemExit('Post-write verification failed.')
        output = Path(os.environ.get('RUNNER_TEMP', '/tmp')) / 'fxa-repair-paths.txt'
        output.write_text('\n'.join(entry['path'] for entry in entries) + '\n')
    print(f'Verified 51 repair files; {len(planned)} files ' + ('applied.' if args.apply else 'ready.'))

if __name__ == '__main__':
    main()
