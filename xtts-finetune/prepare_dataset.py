"""
Validate and normalise the recorded dataset before fine-tuning.

Expects (from voice-recorder.html export, unzipped here):
    dataset/wavs/0001.wav ...
    dataset/metadata.csv        # wavs/0001.wav|transcript|transcript

Does:
  - checks every metadata row points at an existing wav
  - resamples anything that isn't mono/22.05kHz/16-bit PCM
  - drops clips shorter than 1s or longer than 12s (XTTS likes 2-11s)
  - writes dataset/metadata_train.csv and dataset/metadata_eval.csv (90/10)
  - prints total duration

Run:  python prepare_dataset.py
"""

from __future__ import annotations

import csv
import random
import sys
from pathlib import Path

import soundfile as sf
import numpy as np

HERE = Path(__file__).parent
DS = HERE / "dataset"
WAVS = DS / "wavs"
META = DS / "metadata.csv"
TARGET_SR = 22050
MIN_S, MAX_S = 1.0, 12.0


def resample_mono16(path: Path):
    data, sr = sf.read(str(path), always_2d=True)
    data = data.mean(axis=1)  # to mono
    if sr != TARGET_SR:
        # simple linear resample; good enough for training data prep
        n = int(round(len(data) * TARGET_SR / sr))
        x_old = np.linspace(0, 1, len(data), endpoint=False)
        x_new = np.linspace(0, 1, n, endpoint=False)
        data = np.interp(x_new, x_old, data).astype(np.float32)
        sr = TARGET_SR
    peak = np.max(np.abs(data)) or 1.0
    data = (data / peak * 0.97).astype(np.float32)
    sf.write(str(path), data, sr, subtype="PCM_16")
    return len(data) / sr


def main():
    if not META.exists():
        sys.exit(f"missing {META} — export from voice-recorder.html and unzip into dataset/")

    rows = []
    with open(META, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split("|")
            if len(parts) < 2:
                continue
            wav_rel, text = parts[0], parts[1]
            wav = DS / wav_rel
            if not wav.exists():
                print(f"  ! missing wav, skipped: {wav_rel}")
                continue
            dur = resample_mono16(wav)
            if dur < MIN_S or dur > MAX_S:
                print(f"  ! {wav_rel} is {dur:.1f}s (outside {MIN_S}-{MAX_S}s), skipped")
                continue
            rows.append((wav_rel, text.strip(), dur))

    if len(rows) < 10:
        sys.exit(f"only {len(rows)} usable clips — record at least ~20 for a decent fine-tune")

    random.seed(1234)
    random.shuffle(rows)
    n_eval = max(2, len(rows) // 10)
    ev, tr = rows[:n_eval], rows[n_eval:]

    def write(path: Path, data):
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, delimiter="|")
            for wav_rel, text, _ in data:
                w.writerow([wav_rel, text, text])

    write(DS / "metadata_train.csv", tr)
    write(DS / "metadata_eval.csv", ev)

    total = sum(d for *_, d in rows)
    print(
        f"\nOK: {len(rows)} clips  ({total/60:.1f} min total)  "
        f"-> train {len(tr)} / eval {len(ev)}"
    )
    print("next:  python finetune.py")


if __name__ == "__main__":
    main()
