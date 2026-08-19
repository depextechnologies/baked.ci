#!/usr/bin/env bash
# Toggle the SENDbakēd backend between the multi-worker override (`--workers 4`,
# no hot-reload) and the base config (`--workers 1 --reload`, dev-friendly).
#
# Usage:
#   sudo bash /app/scripts/backend_worker_mode.sh multi   # 4 workers, prod-shape
#   sudo bash /app/scripts/backend_worker_mode.sh dev     # 1 worker, --reload
#   sudo bash /app/scripts/backend_worker_mode.sh status  # print current mode
#
# The override lives at /etc/supervisor/conf.d/supervisord_backend_multiworker.conf.
# Toggling flips its extension between `.conf` and `.conf.off` and asks
# supervisord to re-read.

set -euo pipefail

OVERRIDE="/etc/supervisor/conf.d/supervisord_backend_multiworker.conf"
DISABLED="${OVERRIDE}.off"

case "${1:-}" in
  multi)
    if [[ -f "$DISABLED" && ! -f "$OVERRIDE" ]]; then mv "$DISABLED" "$OVERRIDE"; fi
    supervisorctl reread && supervisorctl update
    sleep 3
    supervisorctl status backend
    echo "→ backend is now in MULTI-worker mode (--workers 4). Hot-reload disabled."
    ;;
  dev)
    if [[ -f "$OVERRIDE" ]]; then mv "$OVERRIDE" "$DISABLED"; fi
    supervisorctl reread && supervisorctl update
    sleep 3
    supervisorctl status backend
    echo "→ backend is now in DEV mode (--workers 1 --reload). Hot-reload on."
    ;;
  status)
    if [[ -f "$OVERRIDE" ]]; then echo "MULTI (4 workers, no reload)"
    else echo "DEV (1 worker, --reload)"; fi
    ;;
  *)
    echo "usage: $0 {multi|dev|status}" ; exit 2 ;;
esac
