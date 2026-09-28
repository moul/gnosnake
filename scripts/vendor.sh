#!/usr/bin/env bash
# Fill vendor/ with the transitive closure of this workspace's gno.land
# dependencies, copied out of a gnolang/gno checkout ($GNOROOT/examples).
#
# `gnopm vendor` is the first-class way to do this and it is what the Makefile
# calls by default: it copies the bytes the CHAIN serves, which is what this
# repository actually deploys against, and gnomod.lock keeps the hash that
# proves it. This script exists because that path needs the public RPC, and the
# public RPC answers 403 under load often enough that a build cannot depend on
# it (gnopm#424). What you get here is master's copy of each package, not
# mainnet's, so they can differ: that difference is exactly what `make deps`
# and a lock verify are for.
#
# Usage: GNOROOT=/path/to/gnolang/gno scripts/vendor.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${GNOROOT:?set GNOROOT to a gnolang/gno checkout}"
examples="$GNOROOT/examples"
[ -d "$examples" ] || { echo "no $examples: GNOROOT must be a gno source tree" >&2; exit 1; }

cd "$root"
mkdir -p vendor

# Every module line this workspace owns, so an import of a sibling is never
# mistaken for something to vendor.
own() { find . -name gnomod.toml -not -path './vendor/*' -exec sed -n 's/^module = "\(.*\)"/\1/p' {} +; }

added=1
while [ "$added" -eq 1 ]; do
  added=0
  mine="$(own)"
  # Imports of gno.land/* across the whole tree, vendored code included: a
  # vendored package pulls its own dependencies in, which is why this loops.
  # Test files count: uassert and urequire are dependencies of this repository
  # even though nothing it publishes imports them. Vendored packages have had
  # their own tests stripped, so this never walks into a test-only closure that
  # belongs to somebody else's repository.
  imports="$(find . -name '*.gno' -not -name '*_filetest.gno' -print0 \
    | xargs -0 grep -ho '^\s*\(_ \|[a-z][a-z0-9_]* \)\?"gno\.land/[a-z0-9_./-]*"$' \
    | grep -o '"gno\.land/[a-z0-9_./-]*"' | tr -d '"' | sort -u)"
  for imp in $imports; do
    grep -qxF "$imp" <<<"$mine" && continue
    dest="vendor/$imp"
    [ -d "$dest" ] && continue
    src="$examples/$imp"
    [ -d "$src" ] || { echo "not in GNOROOT/examples: $imp" >&2; exit 1; }
    mkdir -p "$(dirname "$dest")"
    cp -r "$src" "$dest"
    # A vendored package is a dependency, not a thing this repository tests.
    # Its own tests drag in a second closure (test doubles, harness realms)
    # that nothing here builds, and several of them only pass inside the
    # monorepo. Source only.
    rm -rf "$dest/filetests"
    find "$dest" \( -name '*_test.gno' -o -name '*_filetest.gno' \) -delete
    echo "vendored $imp"
    added=1
  done
done

echo "vendor/: $(find vendor -name gnomod.toml | wc -l | tr -d ' ') packages"
