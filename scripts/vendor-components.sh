#!/usr/bin/env bash
# Vendors the components this site ships from a checkout of sleetcrash/components.
# Usage: scripts/vendor-components.sh [components-checkout]          default: ../components next to this repo, or $COMPONENTS_DIR
#        scripts/vendor-components.sh --check [components-checkout]  report whether the vendored copies are behind the checkout
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
check=0; if [ "${1:-}" = "--check" ]; then check=1; shift; fi
src="${1:-${COMPONENTS_DIR:-$here/../components}}"
dst="$here/vendor"
files="card-binder/card-binder.js card-binder/card-binder.css"
[ -d "$src/card-binder" ] || { echo "no components checkout at $src (pass the path or set COMPONENTS_DIR)"; exit 2; }
status=0
for f in $files; do
  name="$(basename "$f")"
  if [ "$check" = 1 ]; then
    have="$(head -1 "$dst/$name" 2>/dev/null || echo none)"; want="$(head -1 "$src/$f")"
    if [ "$have" = "$want" ]; then echo "current  $name  $want"; else echo "BEHIND   $name  vendored: $have  checkout: $want"; status=1; fi
  else
    mkdir -p "$dst"; cp "$src/$f" "$dst/$name"; echo "vendored $name  $(head -1 "$dst/$name")"
  fi
done
exit $status
