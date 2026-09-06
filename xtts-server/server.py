"""
Local XTTS-v2 voice-cloning server for Audio Reader.

Zero-shot cloning: drop a short (6-30s) mono WAV of a voice into ./voices/
named "<id>.wav", then request it by that <id>. No training.

Endpoints
---------
GET  /health                     -> {"ok": true, "device": "...", "voices": [...]}
GET  /voices                     -> [{"id": "...", "seconds": ...}, ...]
POST /tts   {text, voice, language?, speed?}  -> audio/wav

The Audio Reader app calls POST /tts (see src/tts/xttsEngine.ts). CORS is
open so the browser dev server / PWA can reach it on localhost.
"""

from __future__ import annotations

import io
import os
import time
import threading
from pathlib import Path

import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

# --- config ---------------------------------------------------------------
HERE = Path(__file__).parent
VOICES_DIR = HERE / "voices"
VOICES_DIR.mkdir(exist_ok=True)
MODEL_NAME = os.environ.get("XTTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")
# Optional: a fine-tuned model folder from xtts-finetune/output/model
# (must contain model.pth + config.json + vocab.json + speakers_xtts.pth).
MODEL_DIR = os.environ.get("XTTS_MODEL_DIR", "").strip()
DEFAULT_LANG = os.environ.get("XTTS_LANG", "en")
PORT = int(os.environ.get("XTTS_PORT", "8020"))

# --- lazy model load ----------------------------------------------------------
_tts = None
_device = "cpu"
_load_lock = threading.Lock()


def get_tts():
    global _tts, _device
    if _tts is not None:
        return _tts
    with _load_lock:
        if _tts is not None:
            return _tts
        import torch
        from TTS.api import TTS

        _device = "cuda" if torch.cuda.is_available() else "cpu"
        t0 = time.time()
        if MODEL_DIR:
            cfg = str(Path(MODEL_DIR) / "config.json")
            print(f"[xtts] loading fine-tuned model from {MODEL_DIR} on {_device}...")
            _tts = TTS(model_path=MODEL_DIR, config_path=cfg).to(_device)
        else:
            print(f"[xtts] loading {MODEL_NAME} on {_device} (first run downloads ~1.8GB)...")
            _tts = TTS(MODEL_NAME).to(_device)
        print(f"[xtts] ready in {time.time() - t0:.1f}s")
        return _tts


def list_voices():
    out = []
    for wav in sorted(VOICES_DIR.glob("*.wav")):
        try:
            info = sf.info(str(wav))
            out.append({"id": wav.stem, "seconds": round(info.frames / info.samplerate, 1)})
        except Exception:
            out.append({"id": wav.stem, "seconds": None})
    return out


def voice_path(voice_id: str) -> Path:
    # basic hardening: no path traversal
    safe = "".join(c for c in voice_id if c.isalnum() or c in ("_", "-"))
    p = VOICES_DIR / f"{safe}.wav"
    if not p.exists():
        raise HTTPException(404, f"voice '{voice_id}' not found — add {p.name} to xtts-server/voices/")
    return p


# --- api --------------------------------------------------------------------
app = FastAPI(title="Audio Reader XTTS server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TtsBody(BaseModel):
    text: str
    voice: str
    language: str | None = None
    speed: float | None = None


@app.get("/health")
def health():
    return {
        "ok": True,
        "model_loaded": _tts is not None,
        "device": _device,
        "voices": [v["id"] for v in list_voices()],
    }


@app.get("/voices")
def voices():
    return list_voices()


@app.post("/tts")
def tts(body: TtsBody):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "empty text")
    ref = voice_path(body.voice)
    tts_engine = get_tts()

    lang = body.language or DEFAULT_LANG
    speed = float(body.speed) if body.speed else 1.0
    speed = min(1.6, max(0.6, speed))

    t0 = time.time()
    wav = tts_engine.tts(
        text=text,
        speaker_wav=str(ref),
        language=lang,
        speed=speed,
    )
    dur = time.time() - t0

    buf = io.BytesIO()
    sf.write(buf, wav, 24000, format="WAV", subtype="PCM_16")
    buf.seek(0)
    print(f"[xtts] '{text[:48]}...' -> {len(wav) / 24000:.1f}s audio in {dur:.1f}s ({_device})")
    return Response(content=buf.read(), media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    print(f"[xtts] starting on http://127.0.0.1:{PORT}  (voices dir: {VOICES_DIR})")
    print(f"[xtts] known voices: {[v['id'] for v in list_voices()] or '(none yet — add a .wav to voices/)'}")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
