#!/usr/bin/env bash
# Write publish.sh: the gnokey commands that publish _stage/, and nothing else.
#
# gnopm prints a report and then the script; only the script is wanted in a
# file. The empty check matters more than it looks: the public RPC answers 403
# under load often enough that a naive pipe writes a zero-byte publish.sh, which
# then "runs" and publishes nothing, successfully.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
addr="${1:?pass the creator address}"

for attempt in 1 2 3 4 5; do
  if out="$(gnopm -C _stage publish -print -addr "$addr" 2>/dev/null)" \
     && script="$(sed -n '/^#!/,$p' <<<"$out")" && [ -n "$script" ]; then
    printf '%s\n' "$script" > publish.sh
    echo "wrote publish.sh ($(grep -c '^gnokey' publish.sh) gnokey commands)." >&2
    echo "Read it, then: sh publish.sh" >&2
    exit 0
  fi
  echo "attempt $attempt: the chain did not answer (the public RPC 403s under load); retrying" >&2
  sleep $((attempt * 5))
done
echo "could not reach the chain. Nothing written." >&2
exit 1
