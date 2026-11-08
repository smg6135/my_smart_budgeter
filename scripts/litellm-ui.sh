#!/usr/bin/env bash
set -euo pipefail
pocket_root="$(cd "$(dirname "$0")/.." && pwd)"
pocket_region="${1:-us}"
pocket_port="${2:-4000}"
echo "Dashboard: http://localhost:$pocket_port/ui"
echo 'Username: admin. Password is in Secret Manager: pocket-litellm-ui-password.'
exec "$pocket_root/scripts/kubectl.sh" "$pocket_region" -n pocket port-forward --address=127.0.0.1 svc/litellm "$pocket_port:4000"
