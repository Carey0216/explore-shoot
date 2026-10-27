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
 def test_fragmented_identification_is_not_a_failed_connection(self):
  sock=Mock();sock.recv.side_effect=[b'S',b'SS',b'SSH-2.0-fixture\r\n']
  with patch.object(m.time,'sleep'):self.assertIs(m.ssh_ready(sock,2),sock)
  self.assertEqual(sock.recv.call_count,3)
 def test_transient_reset_retries_only_before_authentication(self):
  sock=Mock()
  with patch.object(m,'connect_once',side_effect=[ConnectionResetError('reset'),sock]) as connect,patch.object(m.time,'sleep'):
   self.assertIs(m.connect({},pathlib.Path('config'),'47.100.13.159',22),sock)
   self.assertEqual(connect.call_count,2)
 def test_invalid_configuration_is_never_retried(self):
  with patch.object(m,'connect_once',side_effect=ValueError('configuration')) as connect:
   with self.assertRaises(ValueError):m.connect({},pathlib.Path('config'),'47.100.13.159',22)
   self.assertEqual(connect.call_count,1)
unittest.main()
