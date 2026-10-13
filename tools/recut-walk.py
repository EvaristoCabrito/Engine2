# Re-cut a sprite pose from a new sheet onto the frames it replaces: same canvas, body height,
# body centre and ground line as the current frames (matched on their medians), then overwrite
# them. Usage:
#   python tools/recut-walk.py <sheet base, no extension> <frames dir> <prefix> <frame count>
# e.g. python tools/recut-walk.py Attachments/WalkRight/sprite-max-px-frames-36-rows-6-cols-6 \
#        public/game/sprites/neera/neera-v2-001 move- 36
# Afterwards: node tools/prepare-sprites.mjs --only=<dir> --force, and restart the 8080 server if
# new file names were added.
import json
import sys
from statistics import median
from PIL import Image

base, out_dir, prefix, count = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])


def stats(imgs):
    boxes = [im.getbbox() for im in imgs]
    return (median(b[3] - b[1] for b in boxes),           # body height
            median((b[0] + b[2]) / 2 for b in boxes),     # body centre x
            max(b[3] for b in boxes))                     # ground line


sheet = Image.open(base + '.png').convert('RGBA')
meta = json.load(open(base + '.json'))['frames']
new = [sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])) for f in (meta[k]['frame'] for k in sorted(meta))]
assert len(new) == count, f'sheet has {len(new)} frames, expected {count}'

old = [Image.open(f'{out_dir}/{prefix}{i}.png').convert('RGBA') for i in range(1, count + 1)]
canvas = old[0].size
h_old, cx_old, ground_old = stats(old)
h_new, cx_new, ground_new = stats(new)
k = h_old / h_new
for i, im in enumerate(new, 1):
    s = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    frame = Image.new('RGBA', canvas, (0, 0, 0, 0))
    frame.alpha_composite(s, (round(cx_old - cx_new * k), round(ground_old - ground_new * k)))
    frame.save(f'{out_dir}/{prefix}{i}.png')
print(f'{prefix}: {count} frames, scale {k:.4f}, canvas {canvas}')
