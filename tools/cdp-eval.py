#!/usr/bin/env python3
"""Evaluate JS in the running debug build over its Chrome DevTools Protocol
websocket, without needing a browser. See FORK.md ("Debug builds").

Usage: tools/cdp-eval.py <tv-ip> '<js expression>'
"""

import socket
import base64
import os
import struct
import json
import sys


def _make_frame(payload):
    payload = payload.encode()
    header = bytearray([0x81])
    mask_key = os.urandom(4)
    length = len(payload)
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.append(0x80 | 126)
        header += struct.pack('>H', length)
    else:
        header.append(0x80 | 127)
        header += struct.pack('>Q', length)
    header += mask_key
    masked = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
    return bytes(header) + masked


def _read_frame(sock):
    buf = b''
    while len(buf) < 2:
        buf += sock.recv(8192)
    length = buf[1] & 0x7F
    idx = 2
    if length == 126:
        while len(buf) < 4:
            buf += sock.recv(8192)
        length = struct.unpack('>H', buf[2:4])[0]
        idx = 4
    while len(buf) < idx + length:
        buf += sock.recv(8192)
    return buf[idx:idx + length].decode(errors='replace')


def cdp_eval(host, expression, port=9222, page='cobalt', timeout=5):
    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        'GET /devtools/page/%s HTTP/1.1\r\n'
        'Host: %s:%d\r\n'
        'Upgrade: websocket\r\n'
        'Connection: Upgrade\r\n'
        'Sec-WebSocket-Key: %s\r\n'
        'Sec-WebSocket-Version: 13\r\n\r\n'
    ) % (page, host, port, key)
    s = socket.create_connection((host, port), timeout=timeout)
    s.sendall(req.encode())
    s.recv(4096)  # handshake response
    cmd = json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': expression}})
    s.sendall(_make_frame(cmd))
    s.settimeout(timeout)
    reply = _read_frame(s)
    s.close()
    return json.loads(reply)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    print(json.dumps(cdp_eval(sys.argv[1], sys.argv[2]), indent=2))
