"""Load mounted credentials without putting secret values in arguments or logs."""

import os
from pathlib import Path

for name in ("LITELLM_MASTER_KEY", "OPENAI_API_KEY"):
    filename = os.environ.get(name + "_FILE")
    if filename:
        os.environ[name] = Path(filename).read_text().strip()
    if not os.environ.get(name):
        raise RuntimeError(name + " is not configured")
os.execvp(
    "litellm",
    [
        "litellm",
        "--config",
        "/etc/litellm/config.yaml",
        "--host",
        "0.0.0.0",
        "--port",
        "4000",
    ],
)
