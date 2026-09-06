"""
Fine-tune XTTS-v2 on your recorded voice.

Prereqs:
  1. pip install -r requirements.txt   (CUDA torch first if you have a GPU)
  2. dataset/wavs/*.wav + dataset/metadata_train.csv + metadata_eval.csv
     (run prepare_dataset.py to create the split)

Run:
  python finetune.py

Output:
  output/run/  — checkpoints + config.json
  When done, the best checkpoint is copied to output/model/ ready for the
  server. Point xtts-server at it (see README "Use the fine-tuned model").

Notes:
  - GPU with >=8 GB VRAM strongly recommended. CPU "works" but a run can take
    days; don't.
  - 200-1000 steps is usually enough for a single-speaker voice on top of the
    pretrained XTTS-v2. Start small, listen, continue if needed.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import torch

from trainer import Trainer, TrainerArgs
from TTS.tts.configs.shared_configs import BaseDatasetConfig
from TTS.tts.datasets import load_tts_samples
from TTS.tts.layers.xtts.trainer.gpt_trainer import GPTArgs, GPTTrainer, GPTTrainerConfig, XttsAudioConfig
from TTS.utils.manage import ModelManager

HERE = Path(__file__).parent
DS = HERE / "dataset"
OUT = HERE / "output"
RUN = OUT / "run"
RUN.mkdir(parents=True, exist_ok=True)

LANGUAGE = (DS / "lang.txt").read_text().strip() if (DS / "lang.txt").exists() else "en"

# ---- training hyperparams (safe single-voice defaults) --------------------
MAX_STEPS = int(os.environ.get("XTTS_STEPS", "600"))
BATCH_SIZE = int(os.environ.get("XTTS_BATCH", "3"))
GRAD_ACUMM = int(os.environ.get("XTTS_GRAD_ACUMM", "84" if BATCH_SIZE < 4 else "42"))
LR = float(os.environ.get("XTTS_LR", "5e-6"))

# ---- download the pretrained XTTS-v2 checkpoint we fine-tune from ----------
print("[finetune] fetching base XTTS-v2 checkpoint...")
mm = ModelManager()
model_path, config_path, _ = mm.download_model("tts_models/multilingual/multi-dataset/xtts_v2")
BASE_DIR = Path(model_path).parent
TOKENIZER = str(BASE_DIR / "vocab.json")
XTTS_CHECKPOINT = str(BASE_DIR / "model.pth")
DVAE = str(BASE_DIR / "dvae.pth")
MEL_STATS = str(BASE_DIR / "mel_stats.pth")
SPEAKERS = str(BASE_DIR / "speakers_xtts.pth")

dataset_config = BaseDatasetConfig(
    formatter="ljspeech",
    dataset_name="myvoice",
    path=str(DS),
    meta_file_train="metadata_train.csv",
    meta_file_val="metadata_eval.csv",
    language=LANGUAGE,
)

audio_config = XttsAudioConfig(sample_rate=22050, dvae_sample_rate=22050, output_sample_rate=24000)

model_args = GPTArgs(
    max_conditioning_length=132300,
    min_conditioning_length=66150,
    max_wav_length=255995,   # ~11.6s
    max_text_length=200,
    mel_norm_file=MEL_STATS,
    dvae_checkpoint=DVAE,
    xtts_checkpoint=XTTS_CHECKPOINT,
    tokenizer_file=TOKENIZER,
    gpt_num_audio_tokens=1026,
    gpt_start_audio_token=1024,
    gpt_stop_audio_token=1025,
    gpt_use_masking_gt_prompt_approach=True,
    gpt_use_perceiver_resampler=True,
)

config = GPTTrainerConfig(
    output_path=str(RUN),
    model_args=model_args,
    run_name="myvoice_xtts",
    project_name="audio-reader",
    audio=audio_config,
    batch_size=BATCH_SIZE,
    batch_group_size=48,
    eval_batch_size=BATCH_SIZE,
    num_loader_workers=2,
    eval_split_max_size=256,
    print_step=25,
    plot_step=100,
    save_step=200,
    save_n_checkpoints=2,
    save_checkpoints=True,
    print_eval=False,
    optimizer="AdamW",
    optimizer_wd_only_on_weights=True,
    optimizer_params={"betas": [0.9, 0.96], "eps": 1e-8, "weight_decay": 1e-2},
    lr=LR,
    lr_scheduler="MultiStepLR",
    lr_scheduler_params={"milestones": [50000, 150000, 300000], "gamma": 0.5, "last_epoch": -1},
    test_sentences=[],
)


def main():
    train_samples, eval_samples = load_tts_samples(
        dataset_config,
        eval_split=True,
        eval_split_max_size=config.eval_split_max_size,
    )

    model = GPTTrainer.init_from_config(config)

    trainer = Trainer(
        TrainerArgs(
            restore_path=None,
            skip_train_epoch=False,
            start_with_eval=False,
            grad_accum_steps=GRAD_ACUMM,
        ),
        config,
        output_path=str(RUN),
        model=model,
        train_samples=train_samples,
        eval_samples=eval_samples,
    )

    # cap by steps not epochs
    trainer.config.epochs = 1000
    trainer.total_steps_done = 0
    print(f"[finetune] device={'cuda' if torch.cuda.is_available() else 'cpu'}  "
          f"steps={MAX_STEPS}  batch={BATCH_SIZE}  grad_accum={GRAD_ACUMM}")

    # simple step cap: monkey-patch the stop condition
    orig = trainer.train_step

    def capped(*a, **k):
        out = orig(*a, **k)
        if trainer.total_steps_done >= MAX_STEPS:
            trainer.keep_avg_train = None
            raise KeyboardInterrupt("reached MAX_STEPS")
        return out

    trainer.train_step = capped
    try:
        trainer.fit()
    except KeyboardInterrupt:
        print("[finetune] stopping (step cap reached)")

    # ---- collect the result the server needs ----
    model_dir = OUT / "model"
    model_dir.mkdir(exist_ok=True)
    # newest checkpoint
    ckpts = sorted(RUN.rglob("best_model.pth")) or sorted(RUN.rglob("checkpoint_*.pth"))
    if not ckpts:
        print("[finetune] no checkpoint found in output/run — check the logs")
        return
    shutil.copy(ckpts[-1], model_dir / "model.pth")
    # config + shared assets
    cfg = sorted(RUN.rglob("config.json"))
    if cfg:
        shutil.copy(cfg[-1], model_dir / "config.json")
    for name in ("vocab.json", "speakers_xtts.pth", "mel_stats.pth", "dvae.pth"):
        src = BASE_DIR / name
        if src.exists():
            shutil.copy(src, model_dir / name)
    print(f"\n[finetune] done -> {model_dir}")
    print("Point the server at it: set XTTS_MODEL_DIR to this folder (see README).")


if __name__ == "__main__":
    main()
