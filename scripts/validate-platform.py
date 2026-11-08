#!/usr/bin/env python3
"""Check rendered boundaries and immutable routing configuration without cloud access."""
from pathlib import Path
import subprocess, yaml

root = Path(__file__).resolve().parents[1]
aliases = yaml.safe_load((root / "services/ai/config.yaml").read_text())["model_list"]
assert {m["model_name"] for m in aliases} == {
    "ocr-bulk",
    "ocr-single",
    "planning",
    "conversation",
}
assert len({m["litellm_params"]["model"] for m in aliases}) == 4
for region in ["us", "sg"]:
    output = subprocess.check_output(
        ["kubectl", "kustomize", str(root / "infra/gitops/overlays" / region)],
        text=True,
    )
    docs = list(yaml.safe_load_all(output))
    deployments = {d["metadata"]["name"]: d for d in docs if d["kind"] == "Deployment"}
    assert set(deployments) == {"api", "litellm", "redis"}
    services = [d for d in docs if d["kind"] == "Service"]
    assert all(d["spec"]["type"] == "ClusterIP" for d in services)
    assert sum(d["kind"] == "Gateway" for d in docs) == 1
    assert any(
        d["kind"] == "GCPBackendPolicy"
        and d["spec"]["default"]["securityPolicy"] == "pocket-api-edge"
        for d in docs
    )
    assert any(
        d["kind"] == "NetworkPolicy" and d["metadata"]["name"] == "default-deny"
        for d in docs
    )
    assert not any(d["kind"] == "Secret" for d in docs)
    assert len([d for d in docs if d["kind"] == "SecretProviderClass"]) == 3
    for name, d in deployments.items():
        pod = d["spec"]["template"]["spec"]
        assert pod["securityContext"]["runAsNonRoot"]
        c = pod["containers"][0]
        assert c["securityContext"]["allowPrivilegeEscalation"] is False
        assert c["securityContext"]["readOnlyRootFilesystem"]
        assert c["readinessProbe"] and c["livenessProbe"] and c["resources"]["requests"]
        if name in ("api", "litellm"):
            assert "@sha256:" in c["image"]
        for env in c.get("env", []):
            if "KEY" in env["name"]:
                assert env["name"].endswith("_FILE")
    api = deployments["api"]["spec"]["template"]["spec"]
    assert api["serviceAccountName"] == "api"
    assert not any(
        v.get("configMap", {}).get("name") == "litellm-config" for v in api["volumes"]
    )
print("Regional manifests and AI secret boundaries verified.")
