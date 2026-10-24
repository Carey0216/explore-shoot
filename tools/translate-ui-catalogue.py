"""Build-time translation of source UI copy only. Never pass user content to this script."""
import importlib.util,json,pathlib,sys
base,manual,pending,output=map(pathlib.Path,sys.argv[1:])
dictionary={**json.loads(base.read_text(encoding='utf8')),**json.loads(manual.read_text(encoding='utf8'))}
if output.exists(): dictionary={**json.loads(output.read_text(encoding='utf8')),**dictionary}
spec=importlib.util.spec_from_file_location('localization_worker',pathlib.Path(__file__).with_name('localization-worker.py'))
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
items=[s for s in json.loads(pending.read_text(encoding='utf8')) if s not in dictionary]
for i,text in enumerate(items):
    dictionary[text]=worker.translate(text,'en-US')
    if i%60==0:
        print('Translated UI copy:',i,'/',len(items),flush=True)
        output.write_text(json.dumps(dictionary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
output.write_text(json.dumps(dictionary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
