#!/usr/bin/env bash
set -euo pipefail
pocket_root="$(cd "$(dirname "$0")/.." && pwd)"
pocket_region="${1:?Usage: scripts/kubectl.sh us|sg [kubectl arguments]}"
case "$pocket_region" in us|sg) ;; *) exit 1 ;; esac
shift
export PATH="$pocket_root/.tools/google-cloud-sdk/bin:$PATH"
exec kubectl --kubeconfig "$pocket_root/.tools/kube-$pocket_region.yaml" "$@"
