#!/usr/bin/env python3
"""Write immutable regional image digests. Input JSON contains no credentials."""
import json, os, re
from pathlib import Path
import yaml

images = json.loads(os.environ["POCKET_IMAGES"])
if set(images) != {"us", "sg"}:
    raise SystemExit("Both regional images are required")
for key, image in images.items():
    if not re.fullmatch(r"[a-z0-9./_-]+@sha256:[a-f0-9]{64}", image):
        raise SystemExit("Immutable Artifact Registry images required")
    name, digest = image.split("@")
    path = Path("infra/gitops/overlays") / key / "kustomization.yaml"
    data = yaml.safe_load(path.read_text())
    data["images"] = [{"name": "pocket-api", "newName": name, "digest": digest}]
    path.write_text(yaml.safe_dump(data, sort_keys=False))
