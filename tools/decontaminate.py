# Edge-colour decontamination for sprites cut from video (Veo + rembg): the soft edge pixels still
# carry the video background's colour, which shows as a grey outline on bright 3D scenes.
# pymatting's foreground estimation removes the background's share from each semi-transparent
# pixel. Alpha is kept exactly; fully solid pixels keep their exact original colour.
#
# Only the sprite folders listed in tools/sprite-cleanup.json ("decontaminate") are processed.
# Reads public/game/sprites/<dir> (never modified), writes public/game/sprites-clean/<dir>.
# Single-threaded on purpose (keeps the CPU cool). Re-runnable; --force redoes existing frames.
#   python tools/decontaminate.py [--force]
import os, sys, re, json, time
os.environ["NUMBA_NUM_THREADS"] = "1"
import numpy as np
from PIL import Image
from pymatting import estimate_foreground_ml

ROOT = "C:/Engine2"
SRC, OUT = f"{ROOT}/public/game/sprites", f"{ROOT}/public/game/sprites-clean"
POSE = re.compile(r"^(?:\d+|(?:idle2?|talk|stand|move(?:-left|-up|-down)?|atk2?(?:-left|-short)?|cast(?:-left)?|hit2?|death2?|counter(?:-left)?)-\d+)\.png$", re.I)
force = "--force" in sys.argv
dirs = json.load(open(f"{ROOT}/tools/sprite-cleanup.json", encoding="utf-8"))["decontaminate"]

t0, done = time.time(), 0
for d in dirs:
    src_dir, out_dir = f"{SRC}/{d}", f"{OUT}/{d}"
    os.makedirs(out_dir, exist_ok=True)
    files = sorted(f for f in os.listdir(src_dir) if POSE.match(f))
    for f in files:
        out = f"{out_dir}/{f}"
        if not force and os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(f"{src_dir}/{f}"):
            continue
        rgba = np.asarray(Image.open(f"{src_dir}/{f}").convert("RGBA")).astype(np.float64) / 255.0
        rgb, alpha = rgba[..., :3], rgba[..., 3]
        fg = np.clip(estimate_foreground_ml(rgb, alpha), 0, 1)
        solid = (alpha >= 254.5 / 255)[..., None]
        clean_rgb = np.where(solid, rgb, fg)                     # solid pixels: exact original colour
        clean = np.dstack([clean_rgb, alpha])                      # alpha: exactly as authored
        Image.fromarray((clean * 255).round().astype(np.uint8), "RGBA").save(out)
        done += 1
    print(f"{d}: {len(files)} frames", flush=True)
print(f"done: {done} frames cleaned in {round(time.time() - t0)} s", flush=True)
