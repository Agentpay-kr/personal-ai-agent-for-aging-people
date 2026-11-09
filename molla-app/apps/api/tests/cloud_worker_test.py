"""Offline tests for documented receipt recovery; never logs in or starts a VM."""
import importlib.util
import sys
import types
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("cloud_manager", Path(__file__).resolve().parents[3] / "workers/cloud_manager.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class CloudError(Exception):
    def __init__(self, status): self.status = status

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.cloud = types.SimpleNamespace(_bearer=lambda **_: True, _me=lambda: {}, _catalog=lambda _: [{"id": "saved-mom", "platform": "android", "temporary": False}], CloudError=CloudError, _session_on_entry=lambda e, s: s.get("profile_id") == e["id"])
        sys.modules["phone_harness"] = types.SimpleNamespace(cloud=self.cloud)
    def test_no_record_does_not_adopt_any_active_session(self):
        self.cloud._api = lambda *a, **k: self.fail("Must not list or adopt account sessions")
        self.assertEqual(worker.run({"operation": "recover", "phoneId": "saved-mom"})["state"], "stopped")
    def test_only_original_receipt_can_recover(self):
        def api(method, path):
            self.calls.append((method, path))
            if path == "/sessions/requests/request-key-123456": return {"id": "session-one", "request_key": "request-key-123456", "cleanup_complete": False}
            return {"id": "session-one", "state": "provisioning", "profile_id": "saved-mom", "expires_at": 9999999999}
        self.cloud._api = api
        result = worker.run({"operation": "recover", "phoneId": "saved-mom", "requestId": "request-key-123456"})
        self.assertEqual(result["sessionId"], "session-one")
        self.assertEqual(self.calls, [("GET", "/sessions/requests/request-key-123456"), ("GET", "/sessions/session-one")])
    def test_missing_session_requires_cleanup_evidence(self):
        def api(method, path):
            if path == "/sessions/session-one": raise CloudError(404)
            return {"id": "session-one", "request_key": "request-key-123456", "cleanup_complete": False}
        self.cloud._api = api
        self.assertEqual(worker.run({"operation": "stop", "phoneId": "saved-mom", "sessionId": "session-one", "requestId": "request-key-123456"})["state"], "closing")
    def test_released_receipt_without_cleanup_stays_closing(self):
        receipt = {"id": "session-one", "request_key": "request-key-123456", "state": "released", "cleanup_complete": False}
        self.cloud._api = lambda *a: receipt
        request = {"operation": "recover", "phoneId": "saved-mom", "requestId": "request-key-123456"}
        self.assertEqual(worker.run(request)["state"], "closing")
        receipt["cleanup_complete"] = True
        self.assertEqual(worker.run(request)["state"], "stopped")
    def test_other_profile_is_rejected(self):
        self.cloud._api = lambda *a: {"id": "session-one", "profile_id": "saved-dad", "state": "ready"}
        self.assertEqual(worker.run({"operation": "status", "phoneId": "saved-mom", "sessionId": "session-one"})["code"], "session_owner_mismatch")

if __name__ == "__main__": unittest.main()
