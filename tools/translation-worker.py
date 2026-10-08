"""Local Argos model inference. Community requests use --once: process memory dies on completion.
No sentence cache, content logs, network requests or user-text files.
"""
import sys,json,re,pathlib,gc
import ctranslate2,sentencepiece
from opencc import OpenCC
ROOT=pathlib.Path(__file__).parent/'bin'/'translation'
MODELS={('zh','en'):'zh_en-1_9',('en','zh'):'en_zh-1_9',('en','ja'):'en_ja-1_1',('ja','en'):'ja_en-1_1'}
engines={}
def engine(source,target):
    pair=(source,target)
    if pair not in engines:
        folder=next((ROOT/MODELS[pair]).rglob('model.bin')).parent
        sp=next((ROOT/MODELS[pair]).rglob('sentencepiece.model'))
        engines[pair]=(ctranslate2.Translator(str(folder),device='cpu',compute_type='int8',intra_threads=2),sentencepiece.SentencePieceProcessor(model_file=str(sp)))
    return engines[pair]
def leg(text,source,target):
    model,sp=engine(source,target)
    chunks=re.split(r'(?<=[。！？!?])|\n',text)
    pieces=[sp.encode(chunk,out_type=str) for chunk in chunks if chunk.strip()]
    translated=model.translate_batch(pieces,beam_size=4,max_decoding_length=512)
    return ' '.join(sp.decode(row.hypotheses[0]).replace('▁',' ').replace('_',' ').strip() for row in translated)
def translate(text,target,source=None):
    source=source or ('ja' if re.search(r'[\u3040-\u30ff]',text) else 'zh' if re.search(r'[\u3400-\u9fff]',text) else 'en')
    if source=='zh': text=OpenCC('t2s').convert(text)
    dest='zh' if target.startswith('zh') else target
    def convert(chunk):
        if not chunk.strip(): return chunk
        if source==dest:return chunk
        if (source,dest) in MODELS:return leg(chunk,source,dest)
        return leg(leg(chunk,source,'en'),'en',dest)
    # Protect development interpolation tokens, URLs, coordinates and numbers.
    fragments=re.split(r'(\{\w+\}|https?://\S+|\b\d+(?:\.\d+)?\b)',text)
    result=''.join(part if i%2 else convert(part) for i,part in enumerate(fragments))
    if target=='zh-TW': result=OpenCC('s2t').convert(result)
    return {'text':result,'source':source}
def work(line):
    request=json.loads(line)
    try:return translate(request['text'],request['target'],request.get('source'))
    finally:request.clear();gc.collect()
if '--once' in sys.argv:
    try: print(json.dumps(work(sys.stdin.read()),ensure_ascii=False))
    except Exception: print(json.dumps({'error':'translation_failed'}))
else:
    for line in sys.stdin:
        try: print(json.dumps(work(line),ensure_ascii=False),flush=True)
        except Exception: print(json.dumps({'error':'translation_failed'}),flush=True)
