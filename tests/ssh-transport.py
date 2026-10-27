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
 def test_explicit_route_only_skips_filtered_direct_connection(self):
  routed=Mock();routed.recv.side_effect=[b'\x05\x00',b'\x05\x00\x00\x01',b'\x00'*6,b'SSH-2.0-OpenSSH_fixture\r\n']
  config={'server':'47.100.13.159','sshTransport':{'mode':'auto','proxyPort':17890,'directFirst':False}}
  with patch.object(m.socket,'create_connection',return_value=routed) as create:
   self.assertIs(m.connect(config,pathlib.Path('private/server.json'),'47.100.13.159',22),routed)
   create.assert_called_once_with(('127.0.0.1',17890),timeout=1)
 def test_route_only_requires_explicit_fallback_and_boolean(self):
  for route in [{'directFirst':False},{'mode':'auto','directFirst':'false','proxyPort':17890}]:
   with patch.object(m.socket,'create_connection') as create:
    with self.assertRaises(ValueError):m.connect({'server':'47.100.13.159','sshTransport':route},pathlib.Path('private/server.json'),'47.100.13.159',22)
    create.assert_not_called()
 def test_explicit_existing_proxy_is_preferred_without_managing_user_app(self):
  routed=Mock();config={'server':'47.100.13.159','sshTransport':{'mode':'auto','directFirst':False,'existingProxyPort':7897,'proxyPort':17890}}
  with patch.object(m,'socks_ready',return_value=routed) as ready,patch.object(m.subprocess,'Popen') as start:
   self.assertIs(m.connect(config,pathlib.Path('private/server.json'),'47.100.13.159',22),routed)
   ready.assert_called_once_with(7897,'47.100.13.159',22);start.assert_not_called()
 def test_existing_proxy_failure_uses_project_fallback_and_bad_port_is_rejected(self):
  routed=Mock();routed.recv.side_effect=[b'\x05\x00',b'\x05\x00\x00\x01',b'\x00'*6,b'SSH-2.0-OpenSSH_fixture\r\n']
  config={'server':'47.100.13.159','sshTransport':{'mode':'auto','directFirst':False,'existingProxyPort':7897,'proxyPort':17890}}
  with patch.object(m,'socks_ready',side_effect=ConnectionRefusedError()),patch.object(m.socket,'create_connection',return_value=routed):
   self.assertIs(m.connect(config,pathlib.Path('private/server.json'),'47.100.13.159',22),routed)
  for bad in [True,'7897',0,65536]:
   config['sshTransport']['existingProxyPort']=bad
   with patch.object(m.socket,'create_connection') as create:
    with self.assertRaises(ValueError):m.connect(config,pathlib.Path('private/server.json'),'47.100.13.159',22)
    create.assert_not_called()
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
