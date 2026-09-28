#!/usr/bin/env bash
# Build the /preview twin: the same realm source, at a second package path.
#
# There is no testnet to stage on right now, so the staging environment is a
# second realm on the same chain: gno.land/r/moul/<name>/preview, flagged
# private = true so the path stays redeployable while the design moves. The
# production path is deployed once and is then permanent, which is the whole
# reason this exists.
#
# Only gnomod.toml differs between the two. If anything else ever has to
# differ, the design is wrong: a realm that behaves differently in staging is
# not the thing you tested.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

src="$(dirname "$(find r -name gnomod.toml | head -1)")"
path="$(sed -n 's/^module = "\(.*\)"/\1/p' "$src/gnomod.toml")"
out="_stage/${path#gno.land/}/preview"

rm -rf "$out"
mkdir -p "$out"
# Source only. Tests are not deployed, and a test file in an addpkg is bytes
# you pay storage on forever.
find "$src" -maxdepth 1 -name '*.gno' -not -name '*_test.gno' -exec cp {} "$out/" \;
cp "$src/README.md" "$out/README.md" 2>/dev/null || true
printf 'module = "%s/preview"\ngno = "0.9"\nprivate = true\n' "$path" > "$out/gnomod.toml"

echo "staged $path/preview -> $out"
echo
echo "It is the same source. The only file that differs:"
diff -u "$src/gnomod.toml" "$out/gnomod.toml" || true
