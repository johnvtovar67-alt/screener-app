"""Explicit local research inputs/outputs; never selects production storage."""
import os
from pathlib import Path

def _directory(name):
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f'{name} must name an existing authorized local directory')
    path = Path(value).expanduser().resolve(strict=True)
    if not path.is_dir():
        raise RuntimeError(f'{name} must be a directory')
    return path

def work_root():
    path = _directory('C1_LIFECYCLE_WORKDIR')
    package = Path(__file__).resolve().parent.parent
    checkout = package.parent.parent if package.parent.name == 'research' else package
    if path == package or package in path.parents or path == checkout or checkout in path.parents:
        raise RuntimeError('Research outputs must be outside the public repository checkout')
    os.umask(0o077)
    specification = (package/'partial-study-plan.md').read_bytes()
    target = path/'partial-study-plan.md'
    if target.exists():
        if target.read_bytes() != specification:
            raise RuntimeError('Existing work specification differs; use a separate research work directory')
    else:
        with target.open('xb') as stream:
            stream.write(specification)
    return path

def source_root():
    return _directory('C1_RESEARCH_SOURCE_ROOT')
