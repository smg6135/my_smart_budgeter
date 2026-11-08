#!/usr/bin/env python3
"""Render public deployment configuration. Never accepts provider secrets."""
import argparse, json, re, hashlib
from pathlib import Path
import yaml

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--config", default="infra/deployment.json")
args = parser.parse_args()
cfg = json.loads(Path(args.config).read_text())
project = cfg["project_id"]
domain = cfg["api_domain"]
if not all(
    re.fullmatch(r"[1-9][0-9]*", str(v))
    for v in cfg["secret_versions"].values()
    if v is not None
):
    raise SystemExit("Pin numeric secret versions")
if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project):
    raise SystemExit("Invalid project ID")
if not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", domain):
    raise SystemExit("Invalid API domain")
regions = {
    "us": "us-central1",
    "sg": "asia-southeast1",
}
for key, region in regions.items():
    path = root / "infra/gitops/overlays" / key
    path.mkdir(parents=True, exist_ok=True)
    docs = []

    def obj(kind, name, spec=None, api="v1", **kwargs):
        item = {"apiVersion": api, "kind": kind, "metadata": {"name": name}, **kwargs}
        if spec is not None:
            item["spec"] = spec
        docs.append(item)

    for account, secret_files in {
        "api": {
            "pocket-litellm-key": "litellm-key",
            "pocket-redis-password": "redis-password",
        },
        "ai": {"pocket-litellm-key": "litellm-key", "pocket-openai-key": "openai-key"},
        "redis": {"pocket-redis-password": "redis-password"},
    }.items():
        docs.append(
            {
                "apiVersion": "v1",
                "kind": "ServiceAccount",
                "metadata": {
                    "name": account,
                    "annotations": {
                        "iam.gke.io/gcp-service-account": f"pocket-{account}@{project}.iam.gserviceaccount.com"
                    },
                },
            }
        )
        # Pin versions for coordinated restarts; never use latest during secret rotation.
        secrets = [
            {
                "resourceName": f'projects/{project}/secrets/{secret}/versions/{cfg["secret_versions"][secret]}',
                "path": filename,
            }
            for secret, filename in secret_files.items()
            if cfg["secret_versions"].get(secret) is not None
        ]
        obj(
            "SecretProviderClass",
            account + "-gke",
            {"provider": "gke", "parameters": {"secrets": yaml.safe_dump(secrets)}},
            api="secrets-store.csi.x-k8s.io/v1",
        )
    obj(
        "ConfigMap",
        "api-config",
        data={
            "APP_ENV": "production",
            "GOOGLE_CLOUD_PROJECT": project,
            "FIRESTORE_DATABASE": cfg.get("firestore_database", "pocket-usage"),
            "REDIS_URL": "redis://redis:6379/0",
            "LITELLM_URL": "http://litellm:4000",
            "SERVICE_REGION": region,
            "AI_DAILY_UNITS": str(cfg.get("ai_daily_units", 300)),
            "AI_ENABLED_TASKS": (
                "ocr-bulk,ocr-single,planning,conversation"
                if cfg["secret_versions"].get("pocket-openai-key")
                else "ocr-bulk,ocr-single"
            ),
            "CORS_ORIGINS": ",".join(cfg["web_origins"]),
        },
    )
    obj(
        "ConfigMap",
        "ai-config",
        data={
            "GOOGLE_CLOUD_PROJECT": project,
            "VERTEX_LOCATION": cfg.get("vertex_location", "global"),
        },
    )
    host = domain if key == "us" else f"{key}.{domain}"
    obj(
        "Gateway",
        "api",
        {
            "gatewayClassName": "gke-l7-global-external-managed",
            "addresses": [{"type": "NamedAddress", "value": f"pocket-{key}-gateway"}],
            "listeners": [
                {
                    "name": "https",
                    "protocol": "HTTPS",
                    "port": 443,
                    "hostname": host,
                    "tls": {
                        "mode": "Terminate",
                        "options": {
                            "networking.gke.io/pre-shared-certs": f"pocket-{key}-tls"
                        },
                    },
                }
            ],
        },
        api="gateway.networking.k8s.io/v1",
    )
    obj(
        "HTTPRoute",
        "api",
        {
            "parentRefs": [{"name": "api", "sectionName": "https"}],
            "hostnames": [host],
            "rules": [
                {
                    "matches": [
                        {"path": {"type": "PathPrefix", "value": "/v1/"}},
                        {"path": {"type": "Exact", "value": "/health"}},
                    ],
                    "backendRefs": [{"name": "api", "port": 8000}],
                }
            ],
        },
        api="gateway.networking.k8s.io/v1",
    )
    obj(
        "HealthCheckPolicy",
        "api",
        {
            "default": {
                "config": {
                    "type": "HTTP",
                    "httpHealthCheck": {"port": 8000, "requestPath": "/health"},
                }
            },
            "targetRef": {"group": "", "kind": "Service", "name": "api"},
        },
        api="networking.gke.io/v1",
    )
    obj(
        "GCPBackendPolicy",
        "api",
        {
            "default": {
                "securityPolicy": "pocket-api-edge",
                "timeoutSec": 120,
                "logging": {"enabled": False},
            },
            "targetRef": {"group": "", "kind": "Service", "name": "api"},
        },
        api="networking.gke.io/v1",
    )
    (path / "regional.yaml").write_text(yaml.safe_dump_all(docs, sort_keys=False))
    old_path = path / "kustomization.yaml"
    old = yaml.safe_load(old_path.read_text()) if old_path.exists() else {}
    previous = next(
        (
            i["newName"] + "@" + i["digest"]
            for i in old.get("images", [])
            if i["name"] == "pocket-api" and "/" + project + "/" in i.get("newName", "")
        ),
        None,
    )
    image = cfg.get("images", {}).get(
        key,
        previous
        or f"{region}-docker.pkg.dev/{project}/pocket/api@sha256:" + ("0" * 64),
    )
    if not re.fullmatch(r"[a-z0-9./_-]+@sha256:[a-f0-9]{64}", image):
        raise SystemExit("Use an immutable image digest")
    name, digest = image.split("@")
    kustomization = {
        "apiVersion": "kustomize.config.k8s.io/v1beta1",
        "kind": "Kustomization",
        "namespace": "pocket",
        "resources": ["../../base", "regional.yaml"],
        "images": [{"name": "pocket-api", "newName": name, "digest": digest}],
    }
    stamp = hashlib.sha256(json.dumps(cfg, sort_keys=True).encode()).hexdigest()
    kustomization["patches"] = [
        {
            "target": {
                "group": "apps",
                "version": "v1",
                "kind": "Deployment",
                "name": name,
            },
            "patch": yaml.safe_dump(
                {
                    "apiVersion": "apps/v1",
                    "kind": "Deployment",
                    "metadata": {"name": name},
                    "spec": {
                        "template": {
                            "metadata": {
                                "annotations": {"pocket/regional-config-sha": stamp}
                            }
                        }
                    },
                }
            ),
        }
        for name in ("api", "litellm", "redis")
    ]
    (path / "kustomization.yaml").write_text(
        yaml.safe_dump(kustomization, sort_keys=False)
    )
    app = {
        "apiVersion": "argoproj.io/v1alpha1",
        "kind": "Application",
        "metadata": {"name": "pocket-" + key, "namespace": "argocd"},
        "spec": {
            "project": "pocket",
            "source": {
                "repoURL": "https://github.com/" + cfg["github_repository"] + ".git",
                "targetRevision": "main",
                "path": "infra/gitops/overlays/" + key,
            },
            "destination": {
                "server": "https://kubernetes.default.svc",
                "namespace": "pocket",
            },
            "ignoreDifferences": [
                {
                    "group": "apps",
                    "kind": "Deployment",
                    "name": name,
                    "jsonPointers": ["/spec/replicas"],
                }
                for name in ("api", "litellm")
            ],
            "syncPolicy": {
                "automated": {"prune": True, "selfHeal": True},
                "syncOptions": [
                    "CreateNamespace=true",
                    "RespectIgnoreDifferences=true",
                ],
            },
        },
    }
    (root / "infra/argocd" / f"application-{key}.yaml").write_text(
        yaml.safe_dump(app, sort_keys=False)
    )
print("Rendered us/sg. Replace placeholder API digests before bootstrap.")
