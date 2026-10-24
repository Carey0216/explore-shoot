"""Safety contracts for the optional local SSH byte transport."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location(
    'transport', pathlib.Path(__file__).resolve().parents[1] / 'tools/deploy/ssh-transport.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)


class TransportContracts(unittest.TestCase):
    def setUp(self):
        self.config = {'server': '192.0.2.9', 'port': 22,
                       'sshTransport': {'mode': 'auto', 'proxyPort': 17890}}
        self.path = pathlib.Path('server.json').resolve()

    def test_other_destinations_are_rejected_before_any_connection(self):
        with patch.object(transport.socket, 'create_connection') as connect:
            for host, port in [('192.0.2.10', 22), ('192.0.2.9', 23)]:
                with self.assertRaises(ValueError):
                    transport.connect(self.config, self.path, host, port)
            connect.assert_not_called()

    def test_existing_direct_environments_need_no_proxy_setting(self):
        sock = Mock()
        with patch.object(transport.socket, 'create_connection', return_value=sock):
            self.assertIs(transport.connect({'server': '192.0.2.9'}, self.path, '192.0.2.9', 22), sock)

    def test_failed_direct_does_not_silently_enable_a_proxy(self):
        with patch.object(transport.socket, 'create_connection', side_effect=OSError) as connect:
            with self.assertRaises(ConnectionError):
                transport.connect({'server': '192.0.2.9'}, self.path, '192.0.2.9', 22)
            self.assertEqual(connect.call_count, 1)

    def test_partial_socks_reply_and_loopback_only_route(self):
        sock = Mock()
        # A stream may split every response field across reads.
        sock.recv.side_effect = [b'\x05', b'\x00', b'\x05\x00', b'\x00\x01', b'\x7f\x00', b'\x00\x01\x00\x00']
        with patch.object(transport.socket, 'create_connection', side_effect=[OSError(), sock]) as connect:
            self.assertIs(transport.connect(self.config, self.path, '192.0.2.9', 22), sock)
            self.assertEqual(connect.call_args.args[0], ('127.0.0.1', 17890))
            self.assertEqual(sock.sendall.call_args.args[0], b'\x05\x01\x00\x01\xc0\x00\x02\x09\x00\x16')

    def test_rejected_proxy_is_closed(self):
        sock = Mock()
        sock.recv.return_value = b'\x05\xff'
        with patch.object(transport.socket, 'create_connection', side_effect=[OSError(), sock]):
            with self.assertRaises(ConnectionError):
                transport.connect(self.config, self.path, '192.0.2.9', 22)
            sock.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
