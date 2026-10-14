# Cuts the BasePikeman sprite sheets out of the five Veo videos (Downloads, 2026-10-13).
# Every pose lands on one shared 1000x800 canvas at one scale: the standing body (helmet top to
# soles) is BODY px tall and the soles sit on FEET_Y. Each video is measured once, on a frame where
# he stands still, and that scale/ground line holds for every clip cut from it (static camera,
# walking in place), so nothing pops in size or position when the pose changes.
#   python tools/build-base-pikeman.py <scratch dir>
import os, sys, subprocess, glob
import numpy as np
from PIL import Image
from rembg import new_session, remove

DL = os.path.expanduser("~/Downloads")
OUT = "C:/Engine2/public/game/sprites/BasePikeman"
W, H, BODY, FEET_Y = 1000, 800, 600, 780

VIDEOS = {  # file, time (s) of a frame where he stands still, facing the camera
    "idle": ("Pikeman_maintaining_combat_idle_*20261013214028.mp4", 0.0),
    "left": ("Pikeman_walking_and_attacking_20261013214533.mp4", 5.5),
    "front": ("Pikeman_walking_and_attacking_20261013214633.mp4", 4.5),
    "hit": ("Pikeman_hit_reaction_and_fall_20261013214902.mp4", 3.0),
    "right": ("Pikeman_walking_and_attacking_20261013214943.mp4", 2.7),
}
CLIPS = [  # output prefix, video, start s, end s, frames
    ("", "idle", 0.0, 6.0, 36),           # idle
    ("move-left-", "left", 0.0, 5.0, 36), # walk left: first 5 s
    ("move-", "right", 0.0, 1.75, 36),    # walk right, before he turns
    ("move-down-", "front", 0.33, 2.67, 36),  # walking towards the camera
    ("atk-", "front", 5.75, 8.25, 36),    # spear thrust
    ("hit-", "hit", 0.25, 1.5, 20),       # flinch
    ("death-", "hit", 6.0, 8.5, 36),      # struck down, falls, lies still
]

scratch = sys.argv[1]
session = new_session("birefnet-general")


def video(key):
    return glob.glob(os.path.join(DL, VIDEOS[key][0]))[0]


def frames(key, start, end, n, tag):
    d = os.path.join(scratch, tag)
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, "*.png")): os.remove(f)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(end - start), "-i", video(key), os.path.join(d, "%04d.png")], check=True)
    all_ = sorted(glob.glob(os.path.join(d, "*.png")))
    idx = [round(i * (len(all_) - 1) / (n - 1)) for i in range(n)] if n > 1 else [0]
    return [all_[i] for i in idx]


def cut(path):
    return np.asarray(remove(Image.open(path).convert("RGB"), session=session).convert("RGBA"))


def measure(rgba):
    a = rgba[..., 3] > 128
    rows = a.sum(1)
    ys = np.nonzero(rows >= 3)[0]
    feet = ys.max()
    figh = feet - ys.min()
    head = next(y for y in ys if rows[y] >= figh * 0.04)  # first row wider than the spear shaft
    cols = np.nonzero(a[int(feet - figh * 0.2):feet + 1].sum(0))[0]
    body = a[head:feet + 1]
    cx = np.nonzero(body.sum(0) >= figh * 0.05)[0]
    return feet, feet - head, (cx.min() + cx.max()) / 2 if len(cx) else (cols.min() + cols.max()) / 2


ref = {}
for key, (_, t) in VIDEOS.items():
    f = frames(key, t, t + 0.05, 1, f"ref-{key}")[0]
    feet, body, cx = measure(cut(f))
    ref[key] = (BODY / body, feet, cx)
    print(f"{key}: body {body}px  scale {BODY / body:.3f}", flush=True)

os.makedirs(OUT, exist_ok=True)
for prefix, key, start, end, n in CLIPS:
    s, feet, cx = ref[key]
    if all(os.path.exists(os.path.join(OUT, f"{prefix}{i + 1}.png")) for i in range(n)):
        print(f"{prefix or 'idle'}: already cut", flush=True)
        continue
    for i, f in enumerate(frames(key, start, end, n, f"clip-{prefix or 'idle'}")):
        out = os.path.join(OUT, f"{prefix}{i + 1}.png")
        if os.path.exists(out) and i < n - 1 and os.path.exists(os.path.join(OUT, f"{prefix}{i + 2}.png")):
            continue  # resumed run: this frame was finished (the next one exists too)
        im = Image.fromarray(cut(f))
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(im, (round(W / 2 - cx * s), round(FEET_Y - feet * s)))  # straight copy: alpha kept exactly
        canvas.save(out)
    print(f"{prefix or 'idle'}: {n} frames", flush=True)
print("done", flush=True)
