"""Cross-process Redis pub/sub fan-out verification.

Spawns two subprocesses:
  - Subscriber (B) subscribes to channel `job:XYZ` and reports the first frame it receives.
  - Publisher (A) publishes a frame to the same channel.
Passes if B receives the frame within 500ms of A's publish.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

import pytest

BACKEND_DIR = Path("/app/backend")
REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/0")

SUBSCRIBER_SCRIPT = r"""
import asyncio, json, sys, time
import redis.asyncio as redis

async def main(url, channel):
    r = redis.from_url(url, decode_responses=True)
    ps = r.pubsub()
    await ps.subscribe(channel)
    # Signal readiness on stdout
    print("READY", flush=True)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        msg = await ps.get_message(ignore_subscribe_messages=True, timeout=1.0)
        if msg is not None:
            payload = msg.get("data")
            recv_ns = time.time_ns()
            print("RECV " + str(recv_ns) + " " + payload, flush=True)
            break
    await ps.close()
    await r.close()

asyncio.run(main(sys.argv[1], sys.argv[2]))
"""

PUBLISHER_SCRIPT = r"""
import asyncio, json, sys, time
import redis.asyncio as redis

async def main(url, channel, payload):
    r = redis.from_url(url, decode_responses=True)
    # small wait to let subscriber settle
    await asyncio.sleep(0.1)
    send_ns = time.time_ns()
    n = await r.publish(channel, payload)
    print("SENT " + str(send_ns) + " subs=" + str(n), flush=True)
    await r.close()

asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3]))
"""


def test_cross_process_fanout_within_500ms():
    channel = f"job:XPX_{uuid.uuid4().hex[:8]}"
    payload = json.dumps({"type": "location", "lat": 12.34, "lng": 56.78})

    sub_file = BACKEND_DIR / "tests" / "_sub_tmp.py"
    pub_file = BACKEND_DIR / "tests" / "_pub_tmp.py"
    sub_file.write_text(SUBSCRIBER_SCRIPT)
    pub_file.write_text(PUBLISHER_SCRIPT)

    try:
        sub = subprocess.Popen(
            [sys.executable, str(sub_file), REDIS_URL, channel],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        # Wait for READY
        ready_line = sub.stdout.readline().strip()
        assert ready_line == "READY", f"subscriber did not become ready: {ready_line!r}"

        pub = subprocess.run(
            [sys.executable, str(pub_file), REDIS_URL, channel, payload],
            capture_output=True, text=True, timeout=10,
        )
        assert pub.returncode == 0, f"publisher failed: {pub.stderr}"
        sent_line = pub.stdout.strip().splitlines()[-1]
        assert sent_line.startswith("SENT "), sent_line
        send_ns = int(sent_line.split()[1])
        subs_count = int(sent_line.split("subs=")[1])
        assert subs_count >= 1, f"publisher reported 0 subscribers: {sent_line}"

        # Read subscriber output
        recv_line = sub.stdout.readline().strip()
        assert recv_line.startswith("RECV "), f"subscriber didn't receive: {recv_line!r}"
        parts = recv_line.split(" ", 2)
        recv_ns = int(parts[1])
        received_payload = parts[2]
        assert received_payload == payload, f"payload mismatch: {received_payload!r}"

        latency_ms = (recv_ns - send_ns) / 1_000_000.0
        print(f"cross-process latency: {latency_ms:.2f} ms")
        assert latency_ms < 500, f"latency {latency_ms:.2f}ms exceeds 500ms"

        sub.wait(timeout=5)
    finally:
        try:
            sub.kill()
        except Exception:
            pass
        for f in (sub_file, pub_file):
            try:
                f.unlink()
            except Exception:
                pass
