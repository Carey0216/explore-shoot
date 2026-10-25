import importlib.util,pathlib,socket,unittest
from unittest.mock import Mock,patch
spec=importlib.util.spec_from_file_location('transport','tools/deploy/ssh-transport.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TransportTest(unittest.TestCase):
 def test_tcp_accept_without_ssh_banner_uses_restricted_fallback(self):
  direct=Mock();direct.recv.side_effect=ConnectionResetError('filtered')
  routed=Mock();routed.recv.side_effect=[b'\x05\x00',b'\x05\x00\x00\x01',b'\x00'*6,b'SSH-2.0-OpenSSH_fixture\r\n']
  config={'server':'47.100.13.159','port':22,'sshTransport':{'mode':'auto','proxyPort':17890}}
  with patch.object(m.socket,'create_connection',side_effect=[direct,routed]):self.assertIs(m.connect(config,pathlib.Path('private/server.json'),'47.100.13.159',22),routed)
  direct.close.assert_called_once();self.assertEqual(routed.recv.call_args.args,(255,socket.MSG_PEEK))
 def test_unexpected_destinations_are_rejected(self):
  with self.assertRaises(ValueError):m.connect({'server':'47.100.13.159'},pathlib.Path('config'),'127.0.0.1',22)
unittest.main()
