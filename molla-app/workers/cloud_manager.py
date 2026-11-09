"""Pinned Phone Harness adapter. JSON in/out; never returns auth or viewer credentials."""
import contextlib
import io
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("PHONE_HARNESS_HOME", str(ROOT / ".data/cloud/operator"))
os.environ["DO_NOT_TRACK"] = "1"
os.environ["PHONE_HARNESS_TELEMETRY"] = "0"
os.environ["PHONE_HARNESS_NO_UPDATE_CHECK"] = "1"
sys.path.insert(0, str(Path(os.environ.get("MOLLA_PHONE_HARNESS_PATH", ROOT.parent / "phone-harness")) / "src"))
STAGE = "initialization"


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}", value):
        raise ValueError("invalid_identifier")
    return value


def run(data):
    global STAGE
    from phone_harness import cloud
    op = data.get("operation")
    if op not in ("catalog", "start", "status", "stop", "recover"):
        raise ValueError("unsupported_operation")
    if not cloud._bearer(required=False):
        return {"ok": False, "code": "login_required"}
    STAGE = "catalog"
    me = cloud._me()
    catalog = cloud._catalog(me)
    if op == "catalog":
        return {"ok": True, "sessionLimit": me.get("session_limit"), "phones": [
            {"id": e.get("id"), "label": e.get("label"), "platform": e.get("platform"),
             "temporary": bool(e.get("temporary")), "state": e.get("state")}
            for e in catalog
        ]}
    phone_id = identifier(data.get("phoneId"))
    entries = [e for e in catalog if e.get("id") == phone_id and e.get("platform") == "android" and not e.get("temporary")]
    if len(entries) != 1:
        return {"ok": False, "code": "saved_phone_required"}
    entry = entries[0]
    if op == "start":
        STAGE = "create"
        duration = data.get("durationSeconds")
        if not isinstance(duration, int) or not 60 <= duration <= 300:
            raise ValueError("invalid_duration")
        request_id = identifier(data.get("requestId"))
        session = cloud._api("POST", "/sessions", cloud._create_body(entry, duration), headers={"Idempotency-Key": request_id})
    elif op == "recover":
        STAGE = "receipt"
        # Never adopt an unrelated session from the account. Recover only our durable receipt.
        if not data.get("requestId"):
            return {"ok": True, "state": "stopped", "phoneId": phone_id}
        request_id = identifier(data.get("requestId"))
        try:
            receipt = cloud._api("GET", f"/sessions/requests/{request_id}")
        except cloud.CloudError as error:
            # An unknown timed-out POST is not proof that a session was never created.
            if error.status == 404:
                return {"ok": False, "code": "receipt_unavailable"}
            raise
        if receipt.get("request_key") != request_id:
            return {"ok": False, "code": "session_owner_mismatch"}
        if receipt.get("cleanup_complete") or receipt.get("state") == "released":
            return {"ok": True, "state": "stopped", "phoneId": phone_id}
        session = cloud._api("GET", f"/sessions/{identifier(receipt.get('id'))}")
    else:
        STAGE = "session_status"
        session_id = identifier(data.get("sessionId"))
        try:
            session = cloud._api("GET", f"/sessions/{session_id}")
        except cloud.CloudError as error:
            if error.status == 404:
                if not data.get("requestId"):
                    return {"ok": False, "code": "receipt_unavailable"}
                receipt = cloud._api("GET", f"/sessions/requests/{identifier(data['requestId'])}")
                if receipt.get("id") != session_id or receipt.get("request_key") != data["requestId"]:
                    return {"ok": False, "code": "session_owner_mismatch"}
                if receipt.get("cleanup_complete"):
                    return {"ok": True, "state": "stopped", "phoneId": phone_id}
                return {"ok": True, "state": "closing", "phoneId": phone_id, "sessionId": session_id}
            raise
    # The service is authoritative about the session/profile relationship.
    if not cloud._session_on_entry(entry, session):
        return {"ok": False, "code": "session_owner_mismatch"}
    if op == "stop":
        STAGE = "release"
        release = cloud._api("DELETE", f"/sessions/{identifier(session['id'])}")
        stopped = bool(release.get("released")) and not release.get("cleanup_pending")
        return {"ok": True, "state": "stopped" if stopped else "closing", "phoneId": phone_id,
                "sessionId": None if stopped else session["id"]}
    result = {"ok": True, "phoneId": phone_id, "sessionId": session["id"], "state": session.get("state"), "expiresAt": session.get("expires_at")}
    if result["state"] == "ready":
        STAGE = "adb_connect"
        record = cloud._session_record(session, selector=phone_id)
        if record["link"]["kind"] != "adb":
            return {"ok": False, "code": "adb_phone_required"}
        # Provider's adb unlock secret stays inside this process. Not a device PIN.
        result["serial"] = cloud.ensure_connected(record, quiet=True)
    return result


def main():
    try:
        data = json.loads(sys.stdin.read(8192))
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            result = run(data)
    except BaseException as error:
        # No raw exception/response: either can include temporary viewer/adb credentials.
        code = getattr(error, "code", None)
        result = {"ok": False, "code": code if isinstance(code, str) and re.fullmatch(r"[a-z_]{1,60}", code) else "cloud_request_failed", "stage": STAGE, "httpStatus": getattr(error, "status", None), "errorClass": type(error).__name__}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
