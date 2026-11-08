#!/usr/bin/env bash
set -euo pipefail
pocket_root="$(cd "$(dirname "$0")/.." && pwd)"
if command -v gcloud >/dev/null; then exec gcloud "$@"; fi
if [ -x "$pocket_root/.tools/google-cloud-sdk/bin/gcloud" ]; then
  export CLOUDSDK_PYTHON="${CLOUDSDK_PYTHON:-$(command -v python3)}"
  exec "$pocket_root/.tools/google-cloud-sdk/bin/gcloud" "$@"
fi
echo 'Install Google Cloud CLI: https://docs.cloud.google.com/sdk/docs/install-sdk' >&2
exit 1
