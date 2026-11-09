"""Owner-bound, read-only Phone Harness adapter. No eval or arbitrary scripts."""
import json
import os
from pathlib import Path
import sys


def main():
    if sys.argv[1:] != ["diagnose"]:
        raise ValueError("Only diagnose is supported in this release")
    serial = os.environ.get("MOLLA_PHONE_SERIAL")
    owner = os.environ.get("MOLLA_PHONE_OWNER")
    if not serial or not owner:
        raise ValueError("Explicit owner and device binding are required")
    os.environ["ANDROID_SERIAL"] = serial
    os.environ["PHONE_HARNESS_TELEMETRY"] = "false"
    # Each worker process has a separate owner-bound config/state directory.
    os.environ["PHONE_HARNESS_HOME"] = str(Path(__file__).resolve().parents[1] / ".data" / "phones" / owner)
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "phone-harness" / "src"))
    from phone_harness.transport import connect
    phone = connect("android", serial=serial)
    state = phone.send("session.state")
    print(json.dumps({"state": state, "connected": state == "ready", "readOnly": True}))


if __name__ == "__main__":
    main()
