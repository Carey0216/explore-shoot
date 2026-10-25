#!/usr/bin/env python3
"""Restore an offline tar backup into a fresh isolated directory and read all SQL records.
Never opens or overwrites the live database; emits a small credential-free status receipt.
"""
import argparse,datetime,hashlib,json,pathlib,subprocess,tarfile,zipfile,os

def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def run(archive,target,jar,java='java'):
 archive=pathlib.Path(archive).resolve();target=pathlib.Path(target).resolve();jar=pathlib.Path(jar).resolve()
 if target.exists():raise ValueError('Restore target must not exist')
 expected=archive.with_name(archive.name+'.sha256')
 if not expected.is_file() or expected.read_text().split()[0].lower()!=sha(archive):raise ValueError('Backup checksum mismatch')
 target.mkdir(parents=True,mode=0o700);files=0;hashes={}
 with tarfile.open(archive,'r:gz') as tar:
  for m in tar.getmembers():
   name=pathlib.PurePosixPath(m.name)
   if name.is_absolute() or '..' in name.parts or m.issym() or m.islnk():raise ValueError('Unsafe archive entry')
   path=target.joinpath(*name.parts).resolve()
   if not path.is_relative_to(target):raise ValueError('Unsafe restore path')
   if m.isdir():path.mkdir(parents=True,exist_ok=True,mode=0o700);continue
   if not m.isfile() or m.size>8*1024**3:raise ValueError('Unexpected backup entry')
   path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
   with tar.extractfile(m) as source,path.open('xb') as out:
    h=hashlib.sha256()
    while True:
     b=source.read(1048576)
     if not b:break
     out.write(b);h.update(b)
   if sha(path)!=h.hexdigest():raise ValueError('Restored file verification failed')
   os.chmod(path,0o600);hashes[str(name)]=h.hexdigest();files+=1
 database=target/'campus.mv.db'
 if not database.is_file():raise ValueError('SQL database missing')
 before=sha(database)
 with zipfile.ZipFile(jar) as z:
  dep=next(n for n in z.namelist() if n.startswith('BOOT-INF/lib/h2-') and n.endswith('.jar'))
  h2=target/'.restore-h2.jar';h2.write_bytes(z.read(dep))
 script=target/'.restore-all-records.sql';url='jdbc:h2:file:'+str(database)[:-6].replace('\\','/')+';IFEXISTS=TRUE;ACCESS_MODE_DATA=r'
 result=subprocess.run([java,'-Xmx256m','-cp',str(h2),'org.h2.tools.Shell','-url',url,'-user','sa','-password','','-sql',"SCRIPT TO '"+str(script).replace('\\','/').replace("'","''")+"'"],capture_output=True,timeout=120)
 if result.returncode or b'Error:' in result.stdout or not script.is_file() or script.stat().st_size<100:raise ValueError('Restored SQL could not be read')
 if sha(database)!=before:raise ValueError('Read-only validation altered the copy')
 # Private SQL export and temporary dependency are not needed after the complete read.
 script.unlink();h2.unlink()
 return {'available':True,'verified':True,'createdAt':datetime.datetime.fromtimestamp(archive.stat().st_mtime,datetime.timezone.utc).isoformat(),'sha256':sha(archive),'restoreVerifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'restoredFiles':files,'databaseReadable':True,'message':'完整备份已在隔离目录恢复，逐文件核验并完整读取SQL；线上数据未替换。'}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--archive',required=True);p.add_argument('--target',required=True);p.add_argument('--jar',required=True);p.add_argument('--java',default='java');p.add_argument('--status');a=p.parse_args();r=run(a.archive,a.target,a.jar,a.java)
 if a.status:
  output=pathlib.Path(a.status);output.parent.mkdir(parents=True,exist_ok=True,mode=0o700);temporary=output.with_name(output.name+'.tmp');temporary.write_text(json.dumps(r,ensure_ascii=False),encoding='utf-8');os.chmod(temporary,0o600);temporary.replace(output)
 print(json.dumps(r,ensure_ascii=False))
