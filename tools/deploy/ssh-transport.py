#!/usr/bin/env python3
"""OpenSSH byte transport: direct first, then an explicitly configured local route.

No SSH authentication is implemented here. OpenSSH retains the private key,
strict host verification, encryption and server-alive handling.
"""
import argparse
import ipaddress
import json
import os
import pathlib
import socket
import struct
import subprocess
import sys
import threading
import time


def exact(sock, count):
    result = bytearray()
    while len(result) < count:
        part = sock.recv(count - len(result))
        if not part:
            raise ConnectionError('Local route closed during negotiation')
        result.extend(part)
    return bytes(result)


def ssh_ready(sock, timeout):
    # A TCP accept alone can be a network filter that resets after the first SSH bytes.
    # Peek so OpenSSH still receives and verifies the complete server identification.
    sock.settimeout(timeout)
    banner = sock.recv(255, socket.MSG_PEEK)
    if not banner.startswith(b'SSH-'):
        raise ConnectionError('SSH identification was not received')
    return sock


def connect(configuration, config_path, host, port):
    if str(ipaddress.ip_address(host)) != configuration['server'] or port != int(configuration.get('port', 22)):
        raise ValueError('Transport destination differs from local server configuration')
    direct = None
    try:
        direct = socket.create_connection((host, port), timeout=2.5)
        return ssh_ready(direct, 2.5)
    except OSError:
        if direct is not None:
            direct.close()
    route = configuration.get('sshTransport', {})
    if route.get('mode') != 'auto':
        raise ConnectionError('Direct SSH unavailable and no local fallback configured')
    proxy_port = int(route['proxyPort'])
    if not 1024 <= proxy_port <= 65535:
        raise ValueError('Invalid loopback route port')
    try:
        sock = socket.create_connection(('127.0.0.1', proxy_port), timeout=1)
    except OSError:
        executable = pathlib.Path(route['proxyExecutable']).resolve()
        profile = pathlib.Path(route['proxyConfig']).resolve()
        if not executable.is_file() or executable.name.lower() != 'clash-win64.exe':
            raise ValueError('Existing local route executable is missing')
        if not profile.is_file() or not profile.is_relative_to(config_path.parent / 'ssh-network'):
            raise ValueError('Route profile must stay in the local deployment directory')
        with (profile.parent / 'route.log').open('ab') as log:
            process = subprocess.Popen(
                [str(executable), '-d', str(profile.parent), '-f', str(profile)],
                stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
            )
        (profile.parent / 'route.pid').write_text(str(process.pid), encoding='ascii')
        for _ in range(20):
            if process.poll() is not None:
                raise ConnectionError('Isolated local SSH route failed to start')
            try:
                sock = socket.create_connection(('127.0.0.1', proxy_port), timeout=.3)
                break
            except OSError:
                time.sleep(.1)
        else:
            raise ConnectionError('Isolated local SSH route did not become ready')
    try:
        sock.settimeout(12)
        sock.sendall(b'\x05\x01\x00')
        if exact(sock, 2) != b'\x05\x00':
            raise ConnectionError('Local SOCKS route rejected negotiation')
        sock.sendall(b'\x05\x01\x00\x01' + socket.inet_aton(host) + struct.pack('!H', port))
        reply = exact(sock, 4)
        if reply[:3] != b'\x05\x00\x00':
            raise ConnectionError('Local SOCKS route rejected the SSH destination')
        address_size = {1: 4, 4: 16}.get(reply[3])
        if reply[3] == 3:
            address_size = exact(sock, 1)[0]
        if address_size is None:
            raise ConnectionError('Invalid SOCKS response')
        exact(sock, address_size + 2)
        return ssh_ready(sock, 12)
    except BaseException:
        sock.close()
        raise


def bridge(sock):
    if os.name == 'nt':
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    sock.settimeout(None)

    def upload():
        try:
            while True:
                chunk = os.read(sys.stdin.fileno(), 65536)
                if not chunk:
                    break
                sock.sendall(chunk)
            sock.shutdown(socket.SHUT_WR)
        except OSError:
            pass

    threading.Thread(target=upload, daemon=True).start()
    try:
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            view = memoryview(chunk)
            while view:
                view = view[os.write(sys.stdout.fileno(), view):]
    finally:
        sock.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    parser.add_argument('host')
    parser.add_argument('port', type=int)
    args = parser.parse_args()
    path = pathlib.Path(args.config).resolve()
    configuration = json.loads(path.read_text(encoding='utf-8-sig'))
    bridge(connect(configuration, path, args.host, args.port))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError) as error:
        print('SSH transport: ' + str(error), file=sys.stderr)
        sys.exit(1)
