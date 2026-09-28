#!/usr/bin/env bash
# The guards: the mistakes that are cheap to make, expensive to undo, and
# invisible to `gno lint`. Each one here has a reason, and three of them are
# permanent if they reach a chain.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
fail=0
say() { printf '  %s\n' "$*"; }
bad() { printf '\033[31mFAIL\033[0m %s\n' "$1"; fail=1; }
ok()  { printf '\033[32m ok \033[0m %s\n' "$1"; }

mods() { find p r -name gnomod.toml -not -path './vendor/*' 2>/dev/null; }

# 1. A realm that is not private cannot ever be redeployed: the path is spent
#    the moment the transaction lands. Being explicit about which of the two
#    you chose is the entire guard.
g=guard-private; msg=""
for m in $(mods); do
  case "$m" in r/*) ;; *) continue ;; esac
  grep -q '^private = true' "$m" && continue
  grep -q '^# public:' "$m" && continue
  msg+=$'\n'"  $m says neither 'private = true' nor '# public: <why>'"
done
[ -z "$msg" ] && ok "$g" || { bad "$g"; echo "$msg"; }

# 2. A realm must not contain its own package path as a literal. The same
#    source is deployed at two paths (see scripts/stage.sh), and a hardcoded
#    link sends every click on the preview to production, which looks like it
#    works. Read the path from the frame instead.
g=guard-selfpath; msg=""
for m in $(mods); do
  case "$m" in r/*) ;; *) continue ;; esac
  d="$(dirname "$m")"
  path="$(sed -n 's/^module = "\(.*\)"/\1/p' "$m")"
  short="/${path#gno.land/}"
  for f in "$d"/*.gno; do
    case "$f" in *_test.gno) continue ;; esac
    hits="$(grep -n "\"$short" "$f" | grep -v '^[0-9]*:[[:space:]]*//' || true)"
    [ -n "$hits" ] && msg+=$'\n'"  $f hardcodes $short: $hits"
  done
done
[ -z "$msg" ] && ok "$g" || { bad "$g"; echo "$msg"; }

# 3. A realm's Render is its product. One that no test calls can break in a way
#    nothing reports, and a live realm cannot be fixed in place.
g=guard-render; msg=""
for m in $(mods); do
  d="$(dirname "$m")"
  grep -qs '^func Render(' "$d"/*.gno || continue
  grep -qs 'Render(' "$d"/*_test.gno || msg+=$'\n'"  $d declares Render and no test calls it"
done
[ -z "$msg" ] && ok "$g" || { bad "$g"; echo "$msg"; }

# 4. Every package carries a README. An import path is a permanent public
#    address; shipping one with no explanation is shipping a dead link.
g=guard-readme; msg=""
for m in $(mods); do
  d="$(dirname "$m")"
  [ -s "$d/README.md" ] || msg+=$'\n'"  $d has no README.md"
done
[ -z "$msg" ] && ok "$g" || { bad "$g"; echo "$msg"; }

# 5. A package's NAME must equal the last element of its path, ignoring a
#    version suffix. The chain enforces it at deploy time and `gno lint` does
#    not, so without this guard the first thing that tells you is a transaction
#    you already paid for. One did: a preview realm at .../gno4/preview
#    declaring `package gno4` was refused with "package name gno4 does not match
#    path element preview", and it reverted the production realm batched beside
#    it in the same transaction (2026-09-28).
g=guard-pkgname; msg=""
for m in $(mods); do
  d="$(dirname "$m")"
  path="$(sed -n 's/^module = "\(.*\)"/\1/p' "$m")"
  last="${path##*/}"
  case "$last" in v[0-9]*) stem="${path%/*}"; last="${stem##*/}" ;; esac
  for f in "$d"/*.gno; do
    [ -e "$f" ] || continue
    got="$(sed -n 's/^package \([a-zA-Z0-9_]*\).*/\1/p' "$f" | head -1)"
    [ "$got" = "$last" ] || msg+=$'\n'"  $f says 'package $got'; $path requires '$last'"
  done
done
[ -z "$msg" ] && ok "$g" || { bad "$g"; echo "$msg"; }

# 6. vendor/ must be complete, so a build needs no chain and no cache. The
#    public RPC answers 403 under load, and a dependency fetched at build time
#    is a build that fails for reasons that have nothing to do with the change.
g=guard-vendor; msg=""
mine="$(mods | xargs -r sed -n 's/^module = "\(.*\)"/\1/p')"
for imp in $(find p r -name '*.gno' -not -name '*_filetest.gno' 2>/dev/null \
    | xargs -r grep -ho '^\s*\(_ \|[a-z][a-z0-9_]* \)\?"gno\.land/[a-z0-9_./-]*"$' \
    | grep -o '"gno\.land/[a-z0-9_./-]*"' | tr -d '"' | sort -u); do
  grep -qxF "$imp" <<<"$mine" && continue
  [ -d "vendor/$imp" ] || msg+=$'\n'"  $imp is imported and not vendored (run: make deps)"
done
[ -z "$msg" ] && ok "$g" || { bad "$g"; echo "$msg"; }

exit $fail
