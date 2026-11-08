#!/usr/bin/env python3
import json, os, subprocess

project = os.environ["GCP_PROJECT"]
sha = os.environ["GITHUB_SHA"]
regions = {
    "us": "us-central1",
    "sg": "asia-southeast1",
}
images = {}
for key, region in regions.items():
    host = region + "-docker.pkg.dev"
    image = f"{host}/{project}/pocket/api:{sha}"
    subprocess.run(["gcloud", "auth", "configure-docker", host, "--quiet"], check=True)
    subprocess.run(
        [
            "docker",
            "buildx",
            "build",
            "--platform",
            "linux/amd64",
            "--push",
            "--tag",
            image,
            "--metadata-file",
            f"/tmp/{key}-image.json",
            "services/api",
        ],
        check=True,
    )
    metadata = json.load(open(f"/tmp/{key}-image.json"))
    images[key] = image.split(":")[0] + "@" + metadata["containerimage.digest"]
with open(os.environ["GITHUB_ENV"], "a") as env:
    env.write("POCKET_IMAGES=" + json.dumps(images) + "\n")
