# -*- coding: utf-8 -*-
"""
Offline tests for the Jupyter kernel bridge protocol (Phase 9B).

Covers notebook/bridge.py WITHOUT real Jupyter: a fake kernel factory injects
canned kernel messages so the NDJSON state machine (correlation, outputs,
timeout interrupt, restart) is verified deterministically. jupyter_client is
never required here.
"""

import importlib.util
import io
import json
import os
import queue
import unittest

_BRIDGE_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "notebook", "bridge.py"
)
_spec = importlib.util.spec_from_file_location("tianshu_bridge_under_test", _BRIDGE_PATH)
bridge = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bridge)


class QueueEmpty(Exception):
    """Stand-in for queue.Empty raised by get_msg timeouts."""


class FakeKernel:
    """Canned kernel serving a scripted message sequence per execute call."""

    def __init__(self, scripts=None, hang=False):
        self.scripts = list(scripts or [])
        self.hang = hang
        self.interrupted = False
        self.shutdown_called = False
        self.executed = []
        self._counter = 0

    def execute(self, code):
        self._counter += 1
        self.executed.append(code)
        return "req-%d" % self._counter

    def get_msg(self, timeout):
        if self.hang:
            raise QueueEmpty()
        if not self.scripts:
            raise QueueEmpty()
        msg = self.scripts.pop(0)
        if msg == "BLOCK":
            raise QueueEmpty()
        if isinstance(msg, str):  # lazy: bind to current request id
            msg = json.loads(msg % {"req": "req-%d" % self._counter})
        return msg

    def interrupt(self):
        self.interrupted = True

    def shutdown(self):
        self.shutdown_called = True


def _status_idle(request_id):
    # JSON string templates: %(req)s is interpolated lazily by FakeKernel
    # against the msg_id actually returned by execute().
    return json.dumps({"parent_header": {"msg_id": request_id}, "msg_type": "status",
                       "content": {"execution_state": "idle"}})


def _stream(request_id, text, name="stdout"):
    return json.dumps({"parent_header": {"msg_id": request_id}, "msg_type": "stream",
                       "content": {"name": name, "text": text}})


def _error(request_id, ename, evalue):
    return json.dumps({"parent_header": {"msg_id": request_id}, "msg_type": "error",
                       "content": {"ename": ename, "evalue": evalue, "traceback": ["line"]}})


class FakeClock:
    """Manual clock to drive deadlines without real waiting."""

    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


def run_bridge(commands, kernel_factory, clock=None):
    """Runs main() over the given commands and returns parsed outbound events."""
    stdin = io.StringIO("".join(json.dumps(c) + "\n" for c in commands))
    stdout = io.StringIO()
    code = bridge.main(input_stream=stdin, output_stream=stdout, kernel_factory=kernel_factory)
    events = [json.loads(line) for line in stdout.getvalue().splitlines() if line.strip()]
    return code, events


class BridgeProtocolTest(unittest.TestCase):

    def test_reports_unavailable_when_jupyter_client_missing(self):
        original = bridge.load_jupyter_client
        try:
            bridge.load_jupyter_client = lambda: None
            stdin = io.StringIO("")
            stdout = io.StringIO()
            code = bridge.main(input_stream=stdin, output_stream=stdout)
            self.assertEqual(code, 0)
            events = [json.loads(l) for l in stdout.getvalue().splitlines() if l.strip()]
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["type"], "unavailable")
            self.assertIn("jupyter_client", events[0]["reason"])
        finally:
            bridge.load_jupyter_client = original

    def test_execute_ok_collects_stream_outputs_and_stops_at_idle(self):
        kernel = FakeKernel(scripts=[
            _stream("%(req)s", "partial output\n"),
            _stream("%(req)s", "more\n"),
            _status_idle("%(req)s"),
        ])
        clock = FakeClock()
        code, events = run_bridge(
            [
                {"type": "start", "kernelName": "python3"},
                {"type": "execute", "msgId": "m1", "code": "print('x')", "timeoutMs": 1000},
            ],
            lambda jc, name: kernel,
            clock=clock,
        )
        self.assertEqual(code, 0)
        replies = [e for e in events if e["type"] == "execute_reply"]
        self.assertEqual(len(replies), 1)
        reply = replies[0]
        self.assertEqual(reply["msgId"], "m1")
        self.assertEqual(reply["status"], "ok")
        self.assertEqual(reply["executionCount"], 1)
        self.assertEqual([o["text"] for o in reply["outputs"]], ["partial output\n", "more\n"])
        self.assertEqual(kernel.executed, ["print('x')"])

    def test_ignores_messages_from_foreign_requests(self):
        kernel = FakeKernel(scripts=[
            _stream("req-someone-else", "not mine\n"),
            _status_idle("%(req)s"),
        ])
        code, events = run_bridge(
            [
                {"type": "start"},
                {"type": "execute", "msgId": "m1", "code": "1", "timeoutMs": 1000},
            ],
            lambda jc, name: kernel,
        )
        replies = [e for e in events if e["type"] == "execute_reply"]
        self.assertEqual(replies[0]["status"], "ok")
        self.assertEqual(replies[0]["outputs"], [])

    def test_deadline_overrun_interrupts_and_reports_timeout(self):
        kernel = FakeKernel(hang=True)
        clock = FakeClock()

        real_get_msg = kernel.get_msg
        def time_burning_get_msg(timeout):
            clock.advance(timeout)  # each poll consumes wall time
            return real_get_msg(timeout)
        kernel.get_msg = time_burning_get_msg

        code, events = run_bridge(
            [
                {"type": "start"},
                {"type": "execute", "msgId": "m1", "code": "while True: pass", "timeoutMs": 100},
            ],
            lambda jc, name: kernel,
            clock=clock,
        )
        reply = [e for e in events if e["type"] == "execute_reply"][0]
        self.assertEqual(reply["status"], "timeout")
        self.assertEqual(reply["error"]["ename"], "CellTimeout")
        self.assertTrue(kernel.interrupted, "deadline overrun must interrupt the kernel")

    def test_execute_error_surfaces_error_output(self):
        kernel = FakeKernel(scripts=[
            _error("%(req)s", "ZeroDivisionError", "division by zero"),
            _status_idle("%(req)s"),
        ])
        code, events = run_bridge(
            [
                {"type": "start"},
                {"type": "execute", "msgId": "m1", "code": "1/0", "timeoutMs": 1000},
            ],
            lambda jc, name: kernel,
        )
        reply = [e for e in events if e["type"] == "execute_reply"][0]
        self.assertEqual(reply["status"], "error")
        self.assertEqual(reply["error"]["ename"], "ZeroDivisionError")
        self.assertEqual(reply["outputs"][0]["kind"], "error")

    def test_restart_replaces_kernel_and_resets_execution_count(self):
        kernels = [FakeKernel(scripts=[_status_idle('%(req)s')]),
                   FakeKernel(scripts=[_status_idle('%(req)s')])]
        created = []
        def factory(jc, name):
            k = kernels[len(created)]
            created.append(k)
            return k
        code, events = run_bridge(
            [
                {"type": "start"},
                {"type": "execute", "msgId": "a", "code": "x=1", "timeoutMs": 1000},
                {"type": "restart"},
                {"type": "execute", "msgId": "b", "code": "y=2", "timeoutMs": 1000},
            ],
            factory,
        )
        states = [e for e in events if e["type"] == "status"]
        self.assertIn("restarted", [s["state"] for s in states])
        self.assertEqual(len(created), 2)
        self.assertTrue(kernels[0].shutdown_called)
        replies = [e for e in events if e["type"] == "execute_reply"]
        # execution count resets after a restart: fresh kernel, fresh counter
        self.assertEqual([r["executionCount"] for r in replies], [1, 1])

    def test_execute_before_start_is_an_honest_error(self):
        code, events = run_bridge(
            [{"type": "execute", "msgId": "m1", "code": "1+1", "timeoutMs": 1000}],
            lambda jc, name: FakeKernel(),
        )
        reply = [e for e in events if e["type"] == "execute_reply"][0]
        self.assertEqual(reply["status"], "error")
        self.assertEqual(reply["error"]["ename"], "KernelNotStarted")

    def test_malformed_json_is_reported_not_fatal(self):
        stdin = io.StringIO("not-json-at-all\n")
        stdout = io.StringIO()
        code = bridge.main(
            input_stream=stdin,
            output_stream=stdout,
            kernel_factory=lambda jc, name: FakeKernel(),
        )
        events = [json.loads(l) for l in stdout.getvalue().splitlines() if l.strip()]
        self.assertEqual(code, 0)
        self.assertIn("bridge_error", [e["type"] for e in events])


if __name__ == "__main__":
    unittest.main()
