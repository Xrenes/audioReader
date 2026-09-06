# XTTS voice-cloning server

Runs **Coqui XTTS-v2** locally so Audio Reader can read PDFs in **your own voice**
(or any voice you have a short clip of). Zero-shot — no training, just a reference clip.

## What you need

- Python 3.12 (you have it)
- ~3 GB free disk (PyTorch + the XTTS model)
- CPU is fine (~2–5 s per sentence). An NVIDIA GPU makes it near-instant.
- ~500 MB RAM headroom while running

## Setup (once)

```bat
cd xtts-server
setup.bat
```

This makes a `.venv`, installs `coqui-tts` + FastAPI. Takes a while (big download).

### GPU (optional)

Before `setup.bat`, install the CUDA build of torch into the venv:

```bat
py -3.12 -m venv .venv
.venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cu121
setup.bat
```

## Record your reference clip

- **6–30 seconds**, just you reading naturally. 10–15 s is a good target.
- Quiet room, no music, no background voices.
- Mono, 22.05 kHz or higher, WAV.
- Phone voice memo → export/convert to WAV works. Audacity: record → *Export as WAV*.

Save it as:

```
xtts-server/voices/my_voice.wav
```

You can add more: `voices/dad.wav`, `voices/narrator.wav`, etc. The `<filename>` is the voice id.

## Run

```bat
run.bat
```

Leave the window open. First run downloads the model (~1.8 GB). When you see
`starting on http://127.0.0.1:8020` it's ready.

Check it:

```
http://127.0.0.1:8020/health
```

## Use it in the app

1. In Audio Reader → settings, set **XTTS server URL** to `http://localhost:8020`
   (this is the default).
2. `src/config/voices.json` already has a **"My Voice"** entry pointing at
   `provider: "xtts"`, `provider_voice_id: "my_voice"`. Change the id if your
   WAV has a different name.
3. Pick **My Voice** for Ahmed or Akter, select a passage, play.

## API (for reference)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | — | `{ok, device, voices}` |
| GET | `/voices` | — | `[{id, seconds}]` |
| POST | `/tts` | `{text, voice, language?, speed?}` | `audio/wav` |

## Notes

- Runs on `127.0.0.1` only. To use it from your **phone**, change the host in
  `server.py` to `0.0.0.0`, allow the port through the firewall, and set the app's
  XTTS URL to `http://<your-pc-ip>:8020`.
- This server is **not** bundled with the app and never leaves your machine.
- English is XTTS's strongest language; it also does 16 others (incl. some Bangla
  via `language: "hi"`-adjacent handling, but quality varies — English recommended).
