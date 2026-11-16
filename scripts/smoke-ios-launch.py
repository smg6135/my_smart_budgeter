#!/usr/bin/env python3
"""Boot a simulator and verify a real, embedded-bundle iOS launch."""
import json
import plistlib
import subprocess
import sys
import time
from pathlib import Path

app = Path(sys.argv[1]).resolve()
with (app / "Info.plist").open("rb") as file:
    bundle_id = plistlib.load(file)["CFBundleIdentifier"]
devices = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "available", "--json"]))
device = next(
    item
    for runtime, items in devices["devices"].items()
    if "iOS" in runtime
    for item in items
    if "iPhone" in item["name"] and item.get("isAvailable", True)
)
simulator = device["udid"]
if device["state"] != "Booted":
    subprocess.run(["xcrun", "simctl", "boot", simulator], check=True)
subprocess.run(["xcrun", "simctl", "bootstatus", simulator, "-b"], check=True)
subprocess.run(["xcrun", "simctl", "install", simulator, str(app)], check=True)
root = Path(__file__).resolve().parent
with Path("/tmp/pocket-ios-runtime.log").open("w") as log:
    stream = subprocess.Popen(
        ["xcrun", "simctl", "spawn", simulator, "log", "stream", "--style", "compact",
         "--predicate", 'process == "PocketBudget"'], stdout=log, stderr=subprocess.STDOUT,
    )
    try:
        subprocess.run(["xcrun", "simctl", "launch", "--terminate-running-process", simulator, bundle_id], check=True)
        for _ in range(10):
            time.sleep(3)
            services = subprocess.check_output(["xcrun", "simctl", "spawn", simulator, "launchctl", "list"], text=True)
            if not any(bundle_id in line and line.split()[0].isdigit() for line in services.splitlines()):
                raise RuntimeError("Release app exited during launch. Inspect the runtime log/crash report.")
            image = "/tmp/pocket-ios-launch.png"
            subprocess.run(["xcrun", "simctl", "io", simulator, "screenshot", image], check=True, stdout=subprocess.DEVNULL)
            checked = subprocess.run(["swift", str(root / "check-ios-screen.swift"), image], capture_output=True, text=True)
            if checked.returncode == 0:
                print(checked.stdout.strip())
                break
        else:
            raise RuntimeError("Release app did not reach the sign-in screen. Inspect the screenshot/runtime log.")
    finally:
        stream.terminate()
        stream.wait(timeout=10)
