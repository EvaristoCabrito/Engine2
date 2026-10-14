# Cuts the BaseCrossbowman sprite sheets out of its Veo videos (Downloads, 2026-10-13).
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
OUT = "C:/Engine2/public/game/sprites/BaseCrossbowman"
W, H, BODY, FEET_Y = 1200, 800, 600, 780  # wide: the fall lies full length

VIDEOS = {  # file, time (s) of a frame where he stands still, facing the camera
    "portrait": ("CrossbowmanHitReactDeath.mp4", 0.0),
    "landscape": ("CrossbowmanDeathat4Secs.mp4", 4.0),
    "idle": ("BaseCrossBowManIdle.mp4", 0.0),
    "side": ("CrossbowmanWlkfLeftATT.mp4", 5.0),  # side-on: upright just before he raises the crossbow
}
CLIPS = [  # output prefix, video, start s, end s, frames, played back to the start (flinch then recover)
    ("hit-", "landscape", 4.83, 5.83, 12, True),  # he never straightens up in the video: forward, then back
    ("death-", "portrait", 5.25, 8.75, 36, False),
    ("", "idle", 0.0, 6.0, 36, False),
    ("move-left-", "side", 0.0, 4.75, 36, False),  # walks left; move- is its mirror (below)
    ("atk-", "side", 4.75, 7.25, 36, False),       # shoots to the left in the video: mirrored to face right (below)
]
MIRROR_COPY = {"move-left-": "move-"}  # pose -> extra pose written as its horizontal mirror
MIRROR_IN_PLACE = {"atk-"}             # poses stored mirrored (the game mirrors them back when he faces left)

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
for prefix, key, start, end, n, back in CLIPS:
    s, feet, cx = ref[key]
    total = n + (n - 2 if back else 0)
    if all(os.path.exists(os.path.join(OUT, f"{prefix}{i + 1}.png")) for i in range(total)):
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
        if prefix in MIRROR_IN_PLACE: canvas = canvas.transpose(Image.FLIP_LEFT_RIGHT)
        canvas.save(out)
        if prefix in MIRROR_COPY: canvas.transpose(Image.FLIP_LEFT_RIGHT).save(os.path.join(OUT, f"{MIRROR_COPY[prefix]}{i + 1}.png"))
    if back:  # mirror the flinch in time so it ends where it began
        for j in range(n - 2):
            Image.open(os.path.join(OUT, f"{prefix}{n - 1 - j}.png")).save(os.path.join(OUT, f"{prefix}{n + 1 + j}.png"))
    print(f"{prefix or 'idle'}: {total} frames", flush=True)
print("done", flush=True)
