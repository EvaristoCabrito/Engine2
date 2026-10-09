"""Read-only, single-threaded alpha-edge audit; run python tools/audit-sprites.py.

Scores are diagnostic evidence, not a reliable classifier of generation provenance.
Original RGBA pixels are never saved back to the source directory.
"""
import os
for key in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS', 'NUMBA_NUM_THREADS'):
    os.environ[key] = '1'
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]

def measure(path):
    with Image.open(path) as image:
        rgba = np.asarray(image.convert('RGBA'))
    a = rgba[:, :, 3]
    rgb = rgba[:, :, :3].astype(np.float32)
    opaque = a >= 245
    edge = (a >= 8) & (a <= 235)
    if not opaque.any():
        return dict(score=0., neutral=0., blobs=0, shadow=0., edge=0), rgba, None
    distance, indices = ndimage.distance_transform_edt(~opaque, return_indices=True)
    inside = rgb[indices[0], indices[1]]
    # Fit each RGB edge pixel toward a neutral background (black through white).
    # A meaningful colour departure is needed to avoid penalising naturally gray art.
    delta = rgb - inside
    departure = np.linalg.norm(delta, axis=2)
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    interior_saturation = inside.max(axis=2) - inside.min(axis=2)
    nearby = edge & (distance <= 8)
    suspect = nearby & (departure >= 28) & (saturation <= 30) & ((interior_saturation - saturation >= 12) | (departure >= 70))
    score = float(suspect.sum() / max(1, nearby.sum()) * 100)
    labels, count = ndimage.label(a >= 8)
    sizes = np.bincount(labels.ravel())
    main = int(np.argmax(sizes[1:]) + 1) if count else 0
    blobs = sum(1 for i in range(1, count + 1) if i != main and sizes[i] >= 12)
    ys, xs = np.where(opaque)
    lower = np.indices(a.shape)[0] >= np.percentile(ys, 94)
    dark = edge & lower & (rgb.mean(axis=2) < 65) & (saturation < 35) & (distance > 2)
    shadow = float(dark.sum() / max(1, (a >= 8).sum()) * 100)
    location = None
    if suspect.any():
        sy, sx = np.where(suspect)
        closest = int(np.argmin((sx - np.median(sx)) ** 2 + (sy - np.median(sy)) ** 2))
        location = (int(sx[closest]), int(sy[closest]))
    return dict(score=score, neutral=int(suspect.sum()), blobs=blobs, shadow=shadow, edge=int(nearby.sum())), rgba, location

def sheet(path, rgba, location, output):
    frame = Image.fromarray(rgba)
    bbox = frame.getbbox() or (0, 0, frame.width, frame.height)
    frame = frame.crop(bbox)
    canvas = Image.new('RGB', (960, 410), '#ececec')
    draw = ImageDraw.Draw(canvas)
    for x, color, title in ((0, '#00ff00', 'Bright green'), (320, '#20252b', 'Dark ground')):
        backing = Image.new('RGBA', frame.size, color)
        backing.alpha_composite(frame)
        backing.thumbnail((310, 350), Image.Resampling.LANCZOS)
        canvas.paste(backing.convert('RGB'), (x + (320-backing.width)//2, 35))
        draw.text((x+8, 10), title, fill='black')
    cx, cy = location or ((bbox[0]+bbox[2])//2, bbox[1])
    crop = Image.fromarray(rgba).crop((cx-32, cy-32, cx+32, cy+32))
    backing = Image.new('RGBA', crop.size, '#00ff00')
    backing.alpha_composite(crop)
    canvas.paste(backing.resize((300,300), Image.Resampling.NEAREST).convert('RGB'), (650,35))
    draw.text((650,10), 'Edge crop: 4.69x, original pixels', fill='black')
    draw.text((8,390), str(path.relative_to(ROOT / 'public/game/sprites')), fill='black')
    canvas.save(output)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default=str(ROOT / 'shots/audit'))
    parser.add_argument('--sample-contact-sheets', action='store_true', help='Create separate corrected edge crops from one original frame per unit; do not repeat the full metrics scan.')
    args = parser.parse_args()
    out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / 'src/units/manifest.json').read_text())
    if args.sample_contact_sheets:
        for unit in manifest:
            paths = sorted((ROOT / 'public/game/sprites' / unit).glob('*.png'))
            if paths:
                _, rgba, location = measure(paths[0])
                sheet(paths[0], rgba, location, out / (unit.replace('/', '__') + '-edge.png'))
        return
    results = []
    for unit in manifest:
        paths = sorted((ROOT / 'public/game/sprites' / unit).glob('*.png'))
        samples = []
        worst = None
        for path in paths:
            metrics, rgba, location = measure(path)
            samples.append(metrics)
            rank = metrics['score'] + metrics['shadow'] * 2 + min(10, metrics['blobs'])
            if worst is None or rank > worst[0]:
                worst = (rank, path, rgba, location)
        if not samples:
            results.append(dict(unit=unit, frames=0, score=0., blobs=0, shadow=0., verdict='Missing originals', contact=''))
            continue
        score = float(np.median([m['score'] for m in samples]))
        shadow = float(np.percentile([m['shadow'] for m in samples], 90))
        blobs = int(max(m['blobs'] for m in samples))
        verdict = 'Review edge cleaning' if score >= 5 else 'Review shadow/blobs only' if shadow >= 1 or blobs >= 3 else 'Keep unchanged pending visual review'
        name = unit.replace('/', '__') + '.png'
        # Every unit gets evidence, including controls with low scores.
        sheet(worst[1], worst[2], worst[3], out / name)
        results.append(dict(unit=unit, frames=len(paths), score=score, blobs=blobs, shadow=shadow, verdict=verdict, contact=name))
        print(f'{unit}: {len(paths)} frames, edge {score:.2f}%, shadow {shadow:.2f}%', flush=True)
    results.sort(key=lambda r: (-r['score'], -r['shadow']))
    (out / 'metrics.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    lines = ['# Sprite edge audit', '', f'The current manifest has **{len(manifest)} directories**, versus 17 in the task description. All are covered. Originals and sprite-cleanup.json are untouched.', '', 'Every PNG frame was measured at native resolution, one at a time. Edge score is the median percentage of nearby semi-transparent pixels with a substantial RGB departure toward neutral gray. Shadow score is the 90th-percentile percentage of visible pixels that are dark, neutral, semi-transparent and near/below the lowest opaque feet region. Blobs is the maximum number of disconnected alpha components of at least 12 pixels. Natural gray materials, smoke, accessories and death poses can cause false positives; these measurements cannot prove Veo versus Hydra provenance. Contact sheets show the most suspicious frame; display thumbnails do not change originals.', '', '| Unit | Frames | Edge score | Max blobs | Shadow score | Recommendation | Evidence |', '|---|---:|---:|---:|---:|---|---|']
    for r in results:
        lines.append(f"| {r['unit']} | {r['frames']} | {r['score']:.2f}% | {r['blobs']} | {r['shadow']:.2f}% | {r['verdict']} | [contact sheet]({r['contact']}) |")
    lines += ['', 'Apply no automatic cleanup based on these scores. Review the sheets to select the cleanup list. Source-generation labels remain unknown without provenance metadata.']
    (out / 'report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
