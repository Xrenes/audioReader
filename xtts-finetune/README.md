# XTTS fine-tuning — train the app on your voice

Two ways to use your voice with Audio Reader:

| | Effort | Quality | Needs |
|---|---|---|---|
| **Zero-shot** (the `xtts-server` default) | drop one 10–15 s clip in `xtts-server/voices/` | good | nothing here |
| **Fine-tune** (this folder) | record ~40 prompts, run a training job | better, more consistent | an NVIDIA GPU, realistically |

Do zero-shot first. Come here only if you want it noticeably closer to your voice.

---

## 1. Record the dataset — `voice-recorder.html`

Open it in Chrome/Edge:

- **Best:** serve the folder so the mic is allowed and all prompts load —
  ```bat
  cd xtts-finetune
  python -m http.server 8090
  ```
  then open <http://localhost:8090/voice-recorder.html>
- Quick: double-click the file (works, but `file://` may block the mic and only a 5-line fallback set loads).

In the page:

1. **Enable microphone**.
2. For each prompt: **Record** → read the line exactly → **Stop** → **Play** to check → **Re-record** if needed. (`Space` = record/stop, `←/→` = prev/next.)
3. Do all ~40 (about 10 min of your time). Green squares = done.
4. **Export dataset (.zip)** → you get `xtts-dataset.zip`.
5. Unzip it **into `xtts-finetune/dataset/`** so you have:
   ```
   dataset/wavs/0001.wav … 0040.wav
   dataset/metadata.csv
   dataset/lang.txt
   ```

Recording tips: quiet room, no fan/AC hum, consistent distance from the mic,
normal speaking pace, don't over-enunciate. Mistakes are fine — just re-record
that prompt.

---

## 2. Set up the training environment

```bat
cd xtts-finetune
py -3.11 -m venv .venv        REM 3.11 preferred; 3.12 also works
.venv\Scripts\activate

REM GPU (recommended): install CUDA torch FIRST
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121

pip install -r requirements.txt
```

No GPU? You *can* run it CPU-only but a useful run takes many hours to days.
Prefer zero-shot, or rent a cloud GPU box for an hour.

---

## 3. Prepare + train

```bat
python prepare_dataset.py     REM validates, resamples, makes train/eval split
python finetune.py            REM the actual fine-tune
```

`finetune.py` downloads the base XTTS-v2 (~1.8 GB) once, then trains on top of it.

Knobs (env vars, optional):

| var | default | meaning |
|---|---|---|
| `XTTS_STEPS` | `600` | training steps — 300–1000 is the useful range for one voice |
| `XTTS_BATCH` | `3` | lower to `2` or `1` if you hit CUDA OOM |
| `XTTS_LR` | `5e-6` | learning rate — leave it |

When it finishes you get `xtts-finetune/output/model/` containing
`model.pth`, `config.json`, `vocab.json`, `speakers_xtts.pth`, etc.

---

## 4. Use the fine-tuned model

Point the server at it and restart:

```bat
cd ..\xtts-server
set XTTS_MODEL_DIR=..\xtts-finetune\output\model
run.bat
```

(or add `set XTTS_MODEL_DIR=...` near the top of `run.bat` to make it permanent.)

You still pass a **reference clip** on each request — the fine-tuned model just
starts much closer to your voice. Keep a good 10–15 s clip in
`xtts-server/voices/my_voice.wav`; `voices.json`'s **"My Voice"** entry already
points at it.

Check it loaded: <http://127.0.0.1:8020/health> should show your model and
`device`. Then in the app pick **My Voice** and play a passage.

---

## Folder layout

```
xtts-finetune/
├── voice-recorder.html     # record prompts in the browser
├── prompts.json            # the ~40 sentences to read
├── prepare_dataset.py      # validate + resample + split
├── finetune.py             # the training job
├── requirements.txt
├── dataset/                # <- unzip the recorder export here
│   ├── wavs/
│   ├── metadata.csv
│   ├── metadata_train.csv  # made by prepare_dataset.py
│   └── metadata_eval.csv
└── output/
    ├── run/                # checkpoints + logs during training
    └── model/              # the finished model for the server
```
