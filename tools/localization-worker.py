"""Two-language local inference. No external requests, text logs or user-text files."""
import gc
import json
import pathlib
import re
import sys
import ctranslate2
import sentencepiece

ROOT = pathlib.Path(__file__).parent / 'bin' / 'localization'
MODELS = {('zh', 'en'): 'zh_en-1_9', ('en', 'zh'): 'en_zh-1_9'}
engines = {}
PROPER_NAMES={'北方民族大学':'North Minzu University','北民大':'North Minzu University','景遇':'JINGYU'}

def engine(source, target):
    pair = (source, target)
    if pair not in engines:
        base = ROOT / MODELS[pair]
        folder = next(base.rglob('model.bin')).parent
        sp = next(base.rglob('sentencepiece.model'))
        engines[pair] = (
            ctranslate2.Translator(str(folder), device='cpu', compute_type='int8', intra_threads=2),
            sentencepiece.SentencePieceProcessor(model_file=str(sp)))
    return engines[pair]

def translate(text, target):
    dest = 'en' if target == 'en-US' else 'zh'
    source = 'zh' if re.search(r'[\u3400-\u9fff]', text) else 'en'
    if source == dest or not re.search(r'[A-Za-z\u3400-\u9fff]', text):
        return text
    model, sp = engine(source, dest)
    # Preserve paragraph boundaries, links, numbers, placeholders and inline identifiers.
    proper = '|'.join(re.escape(name) for name in PROPER_NAMES)
    parts = re.split(r'(\n+|https?://\S+|\{\w+\}|\b[A-Z][A-Z0-9_-]*\d+[A-Z0-9_-]*\b|[+-]?\d+(?:[.,:/-]\d+)*(?:%|℃|°)?|' + proper + ')', text)
    result = []
    for i, part in enumerate(parts):
        if i % 2 or not part.strip():
            protected=PROPER_NAMES.get(part, part) if dest == 'en' else part
            if dest == 'en' and part.strip() and not part.isspace():
                if result and result[-1] and not result[-1][-1].isspace(): result.append(' ')
                result.append(protected)
                if i + 1 < len(parts) and parts[i + 1] and not re.match(r'[\s。！？!?，,；;:：.)]', parts[i + 1]): result.append(' ')
            else: result.append(protected)
            continue
        sentences = re.split(r'(?<=[。！？!?；;])', part)
        chunks = []
        for sentence in sentences:
            tokens = sp.encode(sentence, out_type=str)
            chunks.extend(tokens[j:j + 180] for j in range(0, len(tokens), 180))
        rows = model.translate_batch(chunks, beam_size=4, max_decoding_length=512)
        leading = part[:len(part) - len(part.lstrip())]
        trailing = part[len(part.rstrip()):]
        translated = (' ' if dest == 'en' else '').join(sp.decode(r.hypotheses[0]).replace('▁', ' ').strip() for r in rows)
        # A translation must never invent or lose numeric data; retain the original if it does.
        if re.findall(r'\d+(?:[.,]\d+)*', translated) != re.findall(r'\d+(?:[.,]\d+)*', part):
            translated = part
        result.append(leading + translated + trailing)
    return ''.join(result).strip()

def work(request):
    return {'texts': [translate(text, request['target']) for text in request['texts']]}

def run(line):
    request = json.loads(line)
    try:
        return work(request)
    finally:
        request.clear()
        gc.collect()

if __name__ == '__main__':
    if '--once' in sys.argv:
        try:
            print(json.dumps(run(sys.stdin.read()), ensure_ascii=False))
        except Exception:
            print(json.dumps({'error': 'localization_failed'}))
    else:
        for line in sys.stdin:
            try:
                print(json.dumps(run(line), ensure_ascii=False), flush=True)
            except Exception:
                print(json.dumps({'error': 'localization_failed'}), flush=True)
