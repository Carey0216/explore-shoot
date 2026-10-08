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
        if not re.search(r'[a-zA-Z\u3040-\u30ff\u3400-\u9fff]',chunk): return chunk
        if source==dest:return chunk
        if (source,dest) in MODELS:return leg(chunk,source,dest)
        return leg(leg(chunk,source,'en'),'en',dest)
    # Keep exact numeric values and resolve navigation units without ambiguous model inference.
    fragments=re.split(r'(\{\w+\}|https?://\S+|\b[A-Z][A-Z0-9_-]*\d+[A-Z0-9_-]*\b|\d+(?:\.\d+)?\s*(?:公里|千米|米|分钟|小時|小时|秒)|\b\d+(?:\.\d+)?\b)',text)
    units={'公里':('公里','キロメートル','kilometers'),'千米':('千米','キロメートル','kilometers'),'米':('米','メートル','meters'),'分钟':('分鐘','分','minutes'),'小时':('小時','時間','hours'),'小時':('小時','時間','hours'),'秒':('秒','秒','seconds')}
    def protected(part):
        match=re.fullmatch(r'(\d+(?:\.\d+)?)\s*(公里|千米|米|分钟|小時|小时|秒)',part)
        if not match:return part
        number,unit=match.groups()
        label=units[unit][2] if target=='en' else units[unit][1] if target=='ja' else units[unit][0] if target=='zh-TW' else unit
        if target=='en' and float(number)==1:label=label.rstrip('s')
        return number+(' ' if target=='en' else '')+label
    result=''
    for i,part in enumerate(fragments):
        piece=protected(part) if i%2 else convert(part)
        if target=='en' and result and piece and ((re.search(r'[a-zA-Z.:]$',result) and re.match(r'\d',piece)) or (re.search(r'\d$',result) and re.match(r'[a-zA-Z]',piece))):result+=' '
        result+=piece
    if target=='zh-TW': result=OpenCC('s2t').convert(result)
    return {'text':result,'source':source}
def work(line):
    request=json.loads(line)
    try:
        if 'texts' in request:
            return {'texts':[translate(text,request['target'])['text'] for text in request['texts']]}
        return translate(request['text'],request['target'],request.get('source'))
    finally:request.clear();gc.collect()
if '--once' in sys.argv:
    try: print(json.dumps(work(sys.stdin.read()),ensure_ascii=False))
    except Exception: print(json.dumps({'error':'translation_failed'}))
else:
    for line in sys.stdin:
        try: print(json.dumps(work(line),ensure_ascii=False),flush=True)
        except Exception: print(json.dumps({'error':'translation_failed'}),flush=True)
