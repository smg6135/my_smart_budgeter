#!/usr/bin/env python3
"""Maintain common manifests from readable service definitions. No cloud calls."""
from pathlib import Path
import yaml
import hashlib

root = Path(__file__).resolve().parents[1]
base = root / "infra/gitops/base"
docs = []


def add(kind, name, spec=None, api="v1", **extra):
    obj = dict(apiVersion=api, kind=kind, metadata={"name": name}, **extra)
    if spec is not None:
        obj["spec"] = spec
    docs.append(obj)


docs.append(
    {
        "apiVersion": "v1",
        "kind": "Namespace",
        "metadata": {
            "name": "pocket",
            "labels": {"pod-security.kubernetes.io/enforce": "restricted"},
        },
    }
)
for name, port, replicas, image in [
    ("api", 8000, 2, "pocket-api"),
    (
        "litellm",
        4000,
        2,
        "ghcr.io/berriai/litellm@sha256:d8b4ac356743d647a13bb93f45b941fcd5f5354122cfd205948a1b192790389d",
    ),
    ("redis", 6379, 1, "redis:7.4.7-alpine"),
]:
    ksa = {"litellm": "ai"}.get(name, name)
    container = {
        "name": name,
        "image": image,
        "ports": [
            {"name": "http" if name != "redis" else "redis", "containerPort": port}
        ],
        "resources": {
            "requests": {
                "cpu": "250m" if name == "redis" else "500m",
                "memory": {"api": "512Mi", "litellm": "1Gi", "redis": "256Mi"}[name],
            },
            "limits": {
                "cpu": "1",
                "memory": {"api": "1Gi", "litellm": "2Gi", "redis": "512Mi"}[name],
            },
        },
        "securityContext": {
            "allowPrivilegeEscalation": False,
            "readOnlyRootFilesystem": True,
            "capabilities": {"drop": ["ALL"]},
        },
        "volumeMounts": [
            {"name": "secrets", "mountPath": "/var/secrets", "readOnly": True},
            {"name": "tmp", "mountPath": "/tmp"},
        ],
    }
    volumes = [
        {
            "name": "secrets",
            "csi": {
                "driver": "secrets-store-gke.csi.k8s.io",
                "readOnly": True,
                "volumeAttributes": {"secretProviderClass": ksa + "-gke"},
            },
        },
        {"name": "tmp", "emptyDir": {}},
    ]
    if name == "api":
        container.update(
            envFrom=[{"configMapRef": {"name": "api-config"}}],
            env=[
                {
                    "name": "LITELLM_MASTER_KEY_FILE",
                    "value": "/var/secrets/litellm-key",
                },
                {"name": "REDIS_PASSWORD_FILE", "value": "/var/secrets/redis-password"},
            ],
            readinessProbe={
                "httpGet": {"path": "/ready", "port": 8000},
                "periodSeconds": 10,
            },
            livenessProbe={
                "httpGet": {"path": "/health", "port": 8000},
                "periodSeconds": 20,
            },
            startupProbe={
                "httpGet": {"path": "/health", "port": 8000},
                "failureThreshold": 30,
                "periodSeconds": 5,
            },
        )
    elif name == "litellm":
        container.update(
            command=["python", "/etc/litellm/start.py"],
            envFrom=[{"configMapRef": {"name": "ai-config"}}],
            env=[
                {
                    "name": "LITELLM_MASTER_KEY_FILE",
                    "value": "/var/secrets/litellm-key",
                },
                {"name": "OPENAI_API_KEY_FILE", "value": "/var/secrets/openai-key"},
                {"name": "HOME", "value": "/tmp"},
                {"name": "LITELLM_LOCAL_MODEL_COST_MAP", "value": "True"},
            ],
            readinessProbe={
                "httpGet": {"path": "/health/liveliness", "port": 4000},
                "periodSeconds": 10,
            },
            livenessProbe={
                "httpGet": {"path": "/health/liveliness", "port": 4000},
                "periodSeconds": 20,
            },
            startupProbe={
                "httpGet": {"path": "/health/liveliness", "port": 4000},
                "failureThreshold": 60,
                "periodSeconds": 5,
            },
        )
        container["volumeMounts"].append(
            {"name": "config", "mountPath": "/etc/litellm", "readOnly": True}
        )
        volumes.append({"name": "config", "configMap": {"name": "litellm-config"}})
    else:
        # Password is loaded inside the shell; redis argv contains only the config path.
        container.update(
            command=["sh", "-ec"],
            args=[
                'umask 077; printf "requirepass %s\\nsave \\"\\"\\nappendonly no\\n" "$(cat /var/secrets/redis-password)" > /tmp/redis.conf; exec redis-server /tmp/redis.conf'
            ],
            readinessProbe={"tcpSocket": {"port": 6379}, "periodSeconds": 5},
            livenessProbe={"tcpSocket": {"port": 6379}, "periodSeconds": 10},
        )
        container["volumeMounts"].append({"name": "data", "mountPath": "/data"})
        volumes.append({"name": "data", "emptyDir": {}})
    spec = {
        "replicas": replicas,
        "selector": {"matchLabels": {"app": name}},
        "template": {
            "metadata": {"labels": {"app": name}},
            "spec": {
                "serviceAccountName": ksa,
                "securityContext": {
                    "runAsNonRoot": True,
                    "runAsUser": 10001,
                    "runAsGroup": 10001,
                    "fsGroup": 10001,
                    "seccompProfile": {"type": "RuntimeDefault"},
                },
                "containers": [container],
                "volumes": volumes,
                "terminationGracePeriodSeconds": 100,
            },
        },
    }
    if name == "litellm":
        content = (root / "services/ai/config.yaml").read_bytes() + (
            root / "services/ai/start.py"
        ).read_bytes()
        spec["template"]["metadata"]["annotations"] = {
            "pocket/config-sha": hashlib.sha256(content).hexdigest()
        }
    if name == "redis":
        spec["strategy"] = {"type": "Recreate"}
    add("Deployment", name, spec, api="apps/v1")
    add(
        "Service",
        name,
        {
            "type": "ClusterIP",
            "selector": {"app": name},
            "ports": [{"port": port, "targetPort": port}],
        },
    )
    if name != "redis":
        add(
            "HorizontalPodAutoscaler",
            name,
            {
                "scaleTargetRef": {
                    "apiVersion": "apps/v1",
                    "kind": "Deployment",
                    "name": name,
                },
                "minReplicas": 2,
                "maxReplicas": 10 if name == "api" else 6,
                "metrics": [
                    {
                        "type": "Resource",
                        "resource": {
                            "name": "cpu",
                            "target": {"type": "Utilization", "averageUtilization": 70},
                        },
                    }
                ],
            },
            api="autoscaling/v2",
        )
        add(
            "PodDisruptionBudget",
            name,
            {"minAvailable": 1, "selector": {"matchLabels": {"app": name}}},
            api="policy/v1",
        )
add(
    "NetworkPolicy",
    "default-deny",
    {"podSelector": {}, "policyTypes": ["Ingress", "Egress"]},
    api="networking.k8s.io/v1",
)
for name, port, source in [
    (
        "api",
        8000,
        [
            {"ipBlock": {"cidr": "35.191.0.0/16"}},
            {"ipBlock": {"cidr": "130.211.0.0/22"}},
        ],
    ),
    ("litellm", 4000, [{"podSelector": {"matchLabels": {"app": "api"}}}]),
    ("redis", 6379, [{"podSelector": {"matchLabels": {"app": "api"}}}]),
]:
    add(
        "NetworkPolicy",
        name + "-ingress",
        {
            "podSelector": {"matchLabels": {"app": name}},
            "policyTypes": ["Ingress"],
            "ingress": [{"from": source, "ports": [{"protocol": "TCP", "port": port}]}],
        },
        api="networking.k8s.io/v1",
    )
dns = {
    "to": [
        {
            "namespaceSelector": {
                "matchLabels": {"kubernetes.io/metadata.name": "kube-system"}
            }
        },
        {"ipBlock": {"cidr": "169.254.20.10/32"}},
    ],
    "ports": [{"protocol": "UDP", "port": 53}, {"protocol": "TCP", "port": 53}],
}
public = {
    "to": [
        {
            "ipBlock": {
                "cidr": "0.0.0.0/0",
                "except": [
                    "10.0.0.0/8",
                    "172.16.0.0/12",
                    "192.168.0.0/16",
                    "169.254.0.0/16",
                ],
            }
        }
    ],
    "ports": [{"protocol": "TCP", "port": 443}],
}
metadata = {
    "to": [{"ipBlock": {"cidr": "169.254.169.254/32"}}],
    "ports": [{"protocol": "TCP", "port": 80}],
}
for name in ["api", "litellm"]:
    egress = [dns, public, metadata]
    if name == "api":
        egress += [
            {
                "to": [{"podSelector": {"matchLabels": {"app": target}}}],
                "ports": [{"protocol": "TCP", "port": port}],
            }
            for target, port in [("litellm", 4000), ("redis", 6379)]
        ]
    add(
        "NetworkPolicy",
        name + "-egress",
        {
            "podSelector": {"matchLabels": {"app": name}},
            "policyTypes": ["Egress"],
            "egress": egress,
        },
        api="networking.k8s.io/v1",
    )
(base / "workloads.yaml").write_text(yaml.safe_dump_all(docs, sort_keys=False))
(base / "litellm-config.yaml").write_text(
    yaml.safe_dump(
        {
            "apiVersion": "v1",
            "kind": "ConfigMap",
            "metadata": {"name": "litellm-config"},
            "data": {
                "config.yaml": (root / "services/ai/config.yaml").read_text(),
                "start.py": (root / "services/ai/start.py").read_text(),
            },
        },
        sort_keys=False,
    )
)
(base / "kustomization.yaml").write_text(
    "resources:\n  - workloads.yaml\n  - litellm-config.yaml\n"
)
