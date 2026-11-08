#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -d .tools/google-cloud-sdk/bin ]; then export PATH="$PWD/.tools/google-cloud-sdk/bin:$PATH"; fi
pocket_region_key="${1:?Usage: scripts/bootstrap-argocd.sh us|sg PROJECT_ID}"
pocket_project="${2:?Project ID required}"
case "$pocket_region_key" in
 us) pocket_region=us-central1 ;;
 sg) pocket_region=asia-southeast1 ;;
 *) echo 'Use us or sg' >&2; exit 1 ;;
esac
mkdir -p .tools
export KUBECONFIG="${KUBECONFIG:-$PWD/.tools/kube-$pocket_region_key.yaml}"
gcloud container clusters get-credentials "pocket-$pocket_region_key" --region "$pocket_region" --project "$pocket_project"
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -
# Argo CD v3.6.1; pin source commit rather than a floating stable URL.
kubectl apply --server-side -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/94037c4d4e1af4bd0651d37a179fbd9e347e668c/manifests/install.yaml
kubectl -n argocd rollout status deployment/argocd-server --timeout=10m
if [ "${3:-deploy}" = "install" ]; then
 echo 'Argo CD installed; application sync will follow the release.'
 exit 0
fi
if grep -Eq 'replace-project|sha256:0{64}|example.com' "infra/gitops/overlays/$pocket_region_key/"*.yaml; then
 echo 'Render real deployment configuration and publish an API image before bootstrap.' >&2; exit 1
fi
kubectl apply -f infra/argocd/project.yaml
kubectl apply -f "infra/argocd/application-$pocket_region_key.yaml"
echo 'Argo CD is private. View with: kubectl -n argocd port-forward svc/argocd-server 8443:443'
echo 'For a private GitHub repo, add its read-only deploy key to Argo CD before syncing.'
