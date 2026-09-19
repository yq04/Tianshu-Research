#!/usr/bin/env python3
"""
Jupyter Kernel Bridge for tianshu-research (Phase 9B).

Speaks a newline-delimited JSON (NDJSON) protocol over stdio between the
Node.js notebook kernel manager and a real Jupyter kernel (via jupyter_client).

Inbound commands (one JSON object per line):
  {"type": "start", "kernelName": "python3"}
  {"type": "execute", "msgId": "<correlation-id>", "code": "...", "timeoutMs": 60000}
  {"type": "interrupt"}
  {"type": "restart", "kernelName": "python3"}
  {"type": "shutdown"}

Outbound events (one JSON object per line):
  {"type": "ready"}
  {"type": "unavailable", "reason": "..."}            # jupyter_client missing etc. — honest degradation
  {"type": "status", "state": "started|restarted|interrupted|shutdown"}
  {"type": "execute_reply", "msgId": "...", "status": "ok|error|timeout",
   "executionCount": N, "outputs": [...], "error": {...}?}
  {"type": "bridge_error", "message": "..."}

Discipline:
  - Missing jupyter_client is reported as `unavailable` and the bridge exits 0;
    the caller must surface `blocked`, never fabricate a receipt.
  - Message correlation follows the Jupyter messaging spec: outputs and the
    final idle status must carry parent_header.msg_id of the execute request.
  - Deadline overrun interrupts the kernel and reports status "timeout" with
    the partial outputs collected so far.

Python dependencies are declared separately in requirements-notebook.txt and
are never installed implicitly.
"""

import io
import json
import sys
import time

PROTOCOL_VERSION = 1
POLL_SECONDS = 0.05


def load_jupyter_client():
    """Returns the jupyter_client module, or None when not installed."""
    try:
        import jupyter_client  # noqa: F401
        return jupyter_client
    except ImportError:
        return None


class RealKernelHandle:
    """Adapter wrapping jupyter_client KernelManager/KernelClient into the
    narrow interface the session logic depends on."""

    def __init__(self, jupyter_client, kernel_name):
        self._jupyter_client = jupyter_client
        self.kernel_name = kernel_name or "python3"
        self.manager, self.client = jupyter_client.manager.start_new_kernel(kernel_name=self.kernel_name)

    def execute(self, code):
        return self.client.execute(code)

    def get_msg(self, timeout):
        return self.client.get_msg(timeout=timeout)

    def interrupt(self):
        self.manager.interrupt_kernel()

    def shutdown(self):
        try:
            self.manager.shutdown_kernel(now=True)
        except Exception:
            pass


class KernelBridgeSession:
    """Protocol state machine. Kernel creation is injectable for offline tests."""

    def __init__(self, output_stream, kernel_factory=None, clock=time.monotonic):
        self.out = output_stream
        self.kernel_factory = kernel_factory or self._default_kernel_factory
        self.clock = clock
        self.jupyter_client = None if kernel_factory is not None else load_jupyter_client()
        self.kernel = None
        self.execution_count = 0

    @staticmethod
    def _default_kernel_factory(jupyter_client, kernel_name):
        return RealKernelHandle(jupyter_client, kernel_name)

    # --- output helpers -------------------------------------------------
    def emit(self, event):
        self.out.write(json.dumps(event, ensure_ascii=False) + "\n")
        self.out.flush()

    # --- lifecycle ------------------------------------------------------
    def on_start(self, cmd):
        if self.jupyter_client is None and self.kernel_factory is KernelBridgeSession._default_kernel_factory:
            self.emit({"type": "unavailable", "reason": "jupyter_client is not installed; install requirements-notebook.txt to enable notebook operations"})
            return
        if self.kernel is None:
            self.kernel = self.kernel_factory(self.jupyter_client, cmd.get("kernelName"))
            self.emit({"type": "status", "state": "started"})
        else:
            self.emit({"type": "status", "state": "started"})

    def on_restart(self, cmd):
        if self.kernel is not None:
            self.kernel.shutdown()
        self.kernel = self.kernel_factory(self.jupyter_client, cmd.get("kernelName"))
        self.execution_count = 0
        self.emit({"type": "status", "state": "restarted"})

    def on_interrupt(self, _cmd):
        if self.kernel is not None:
            self.kernel.interrupt()
        self.emit({"type": "status", "state": "interrupted"})

    def on_shutdown(self, _cmd):
        if self.kernel is not None:
            self.kernel.shutdown()
            self.kernel = None
        self.emit({"type": "status", "state": "shutdown"})

    # --- execution ------------------------------------------------------
    def on_execute(self, cmd):
        msg_id = cmd.get("msgId")
        code = cmd.get("code", "")
        timeout_ms = cmd.get("timeoutMs", 60000)
        try:
            timeout_ms = max(0.05, float(timeout_ms) / 1000.0)
        except (TypeError, ValueError):
            timeout_ms = 60.0

        if self.kernel is None:
            self.emit({"type": "execute_reply", "msgId": msg_id, "status": "error",
                       "error": {"ename": "KernelNotStarted", "evalue": "execute before start"},
                       "outputs": [], "executionCount": None})
            return

        request_id = self.kernel.execute(code)
        outputs = []
        deadline = self.clock() + timeout_ms
        timed_out = False

        while True:
            remaining = deadline - self.clock()
            if remaining <= 0:
                timed_out = True
                break
            try:
                msg = self.kernel.get_msg(timeout=min(POLL_SECONDS, remaining))
            except Exception:  # queue.Empty or transport-specific timeout
                continue

            if msg.get("parent_header", {}).get("msg_id") != request_id:
                continue  # not ours: kernel status chatter or foreign request

            msg_type = msg.get("msg_type")
            content = msg.get("content", {}) or {}

            if msg_type == "status" and content.get("execution_state") == "idle":
                break  # execution finished for this request

            output = self._normalize_output(msg_type, content)
            if output is not None:
                outputs.append(output)

        if timed_out:
            try:
                self.kernel.interrupt()
            except Exception:
                pass
            self.emit({"type": "execute_reply", "msgId": msg_id, "status": "timeout",
                       "outputs": outputs, "executionCount": None,
                       "error": {"ename": "CellTimeout", "evalue": "execution exceeded the deadline and was interrupted"}})
            return

        error = next((o for o in outputs if o.get("kind") == "error"), None)
        self.execution_count += 1
        self.emit({
            "type": "execute_reply",
            "msgId": msg_id,
            "status": "error" if error else "ok",
            "executionCount": self.execution_count,
            "outputs": outputs,
            **({"error": {"ename": error["ename"], "evalue": error["evalue"], "traceback": error["traceback"]}} if error else {}),
        })

    @staticmethod
    def _normalize_output(msg_type, content):
        if msg_type == "stream":
            return {"kind": "stream", "name": content.get("name", "stdout"), "text": content.get("text", "")}
        if msg_type == "error":
            return {"kind": "error", "ename": content.get("ename", "Error"),
                    "evalue": content.get("evalue", ""), "traceback": content.get("traceback", [])}
        if msg_type == "execute_result":
            data = content.get("data", {}) or {}
            return {"kind": "execute_result", "repr": data.get("text/plain", ""), "executionCount": content.get("execution_count")}
        if msg_type == "display_data":
            data = content.get("data", {}) or {}
            return {"kind": "display_data", "repr": data.get("text/plain", "")}
        return None

    # --- dispatch -------------------------------------------------------
    def handle_command(self, cmd):
        kind = cmd.get("type")
        if kind == "start":
            self.on_start(cmd)
        elif kind == "execute":
            self.on_execute(cmd)
        elif kind == "interrupt":
            self.on_interrupt(cmd)
        elif kind == "restart":
            self.on_restart(cmd)
        elif kind == "shutdown":
            self.on_shutdown(cmd)
        else:
            self.emit({"type": "bridge_error", "message": "unknown command type: " + str(kind)})


def main(input_stream=None, output_stream=None, kernel_factory=None, clock=None):
    """Protocol entry point. Injectable streams/factory/clock for offline tests."""
    input_stream = input_stream if input_stream is not None else sys.stdin
    output_stream = output_stream if output_stream is not None else sys.stdout

    kwargs = {} if clock is None else {"clock": clock}
    probe = io.StringIO()  # session emits to the real stream only after startup decision
    session = KernelBridgeSession(output_stream=probe, kernel_factory=kernel_factory, **kwargs)
    if kernel_factory is None and session.jupyter_client is None:
        output_stream.write(json.dumps({
            "type": "unavailable",
            "reason": "jupyter_client is not installed; install requirements-notebook.txt to enable notebook operations",
        }) + "\n")
        output_stream.flush()
        return 0

    session.out = output_stream
    session.emit({"type": "ready", "protocolVersion": PROTOCOL_VERSION})

    for line in input_stream:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except ValueError:
            session.emit({"type": "bridge_error", "message": "malformed NDJSON command"})
            continue
        session.handle_command(cmd)
    return 0


if __name__ == "__main__":
    sys.exit(main())
