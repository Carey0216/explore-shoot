"""Local Kokoro worker. JSON lines only; no network, files or location history."""
import base64
import io
import json
import pathlib
import os
import sys
import wave
import numpy as np
import sherpa_onnx

root = pathlib.Path(__file__).resolve().parent / "bin" / "kokoro-int8-multi-lang-v1_1"
config = sherpa_onnx.OfflineTtsConfig(
    model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=str(root / "model.int8.onnx"), voices=str(root / "voices.bin"),
            tokens=str(root / "tokens.txt"), data_dir=str(root / "espeak-ng-data"),
            dict_dir=str(root / "dict"),
            lexicon=",".join(str(root / f) for f in ["lexicon-us-en.txt", "lexicon-zh.txt"])),
        num_threads=min(4, os.cpu_count() or 2), provider="cpu", debug=False),
    rule_fsts=",".join(str(root / f) for f in ["date-zh.fst", "number-zh.fst"]),
    max_num_sentences=1)
tts = sherpa_onnx.OfflineTts(config)
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    job = {}
    try:
        job = json.loads(line)
        if job["sid"] not in [3, 14, 37, 58, 63, 76] or not 0 < len(job["text"]) <= 120:
            raise ValueError("Invalid speech")
        audio = tts.generate(job["text"], sid=job["sid"], speed=1.0)
        if len(audio.samples) == 0:
            raise ValueError("Empty audio")
        buf = io.BytesIO()
        with wave.open(buf, "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(audio.sample_rate)
            out.writeframes((np.clip(audio.samples, -1, 1) * 32767).astype("<i2").tobytes())
        print(json.dumps({"id": job["id"], "audio": base64.b64encode(buf.getvalue()).decode()}), flush=True)
    except Exception:
        print(json.dumps({"id": job.get("id"), "error": "Synthesis failed"}), flush=True)
