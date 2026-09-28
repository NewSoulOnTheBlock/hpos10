"""Mob sprites from starcraft-ui/ui-kits/rug.png (Brood War Zerg larvae, eggs and births).

Finds every frame cell on the sheet (cells are green-keyed boxes with a black
1px border), keys out the green, recolours the magenta player colour to HPOS
yellow and writes horizontal strips to apps/web/public/zerg/:
  larva.webp      5-frame wriggle, side facing
  curl.webp       4 frames, larva curling into an egg
  egg.webp        12-frame egg pulse (gestation)
  prebirth.webp   8 frames, the egg about to hatch
  hatch-<unit>.webp  7-frame birth out of the egg
  idle-<unit>.webp   the born creature standing still (its last birth frame; the
                     flyers, mutalisk and queen, without the broken egg under them)
Run: python scripts/zerg-mobs.py  (needs Pillow, numpy, scipy)
"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = '/Users/rez/Desktop/memes/hpos10/starcraft-ui/ui-kits/rug.png'
OUT = '/Users/rez/Desktop/memes/hpos10/hpos-pad/apps/web/public/zerg/'
PREV = sys.argv[1] if len(sys.argv) > 1 else None
a = np.array(Image.open(SRC).convert('RGB')).astype(int)

# ---- find the cells, grouped into rows top to bottom
lab, _ = ndimage.label(a.sum(2) != 0)
boxes = []
for i, sl in enumerate(ndimage.find_objects(lab)):
  y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
  w, h = x1 - x0, y1 - y0
  if 12 <= w <= 200 and 12 <= h <= 200 and (lab[sl] == i + 1).sum() > 0.5 * w * h:
    boxes.append((y0, x0, y1, x1))
boxes.sort()
rows = []
for b in boxes:
  if rows and abs(rows[-1][0][0] - b[0]) < 6: rows[-1].append(b)
  else: rows.append([b])
rows = [sorted(r, key=lambda b: b[1]) for r in rows if len(r) != 2]  # drop the palette swatches
NAMES = ['larva0', 'larva1', 'larva2', 'larva3', 'larva4', 'larvadeath', 'curl', 'egg', 'eggdeath0', 'eggdeath1',
         'prebirth', 'lower', 'drone', 'overlord', 'zergling', 'hydralisk', 'mutalisk', 'scourge', 'queen', 'ultralisk', 'defiler']
assert len(rows) == len(NAMES), len(rows)
R = dict(zip(NAMES, rows))

def cell(b):
  y0, x0, y1, x1 = b
  t = a[y0:y1, x0:x1].copy(); r, g, bl = t[..., 0], t[..., 1], t[..., 2]
  key = (abs(r - 74) < 12) & (abs(g - 221) < 12) & (bl < 20)
  mag = (r > 40) & (bl > 40) & (g < np.minimum(r, bl) * 0.55)
  inten = ((r + bl) / 2 / 255.0)[..., None]
  t = np.where(mag[..., None], np.array([254, 235, 0])[None, None, :] * np.clip(inten * 1.15, 0, 1), t)
  alpha = ~key
  # Drop lone specks (the sheet has a few stray pixels far from the sprite).
  l, n = ndimage.label(alpha, structure=np.ones((3, 3)))
  if n: alpha &= np.isin(l, 1 + np.flatnonzero(ndimage.sum(alpha, l, range(1, n + 1)) > 3))
  return Image.fromarray(np.dstack([t.astype(np.uint8), np.where(alpha, 255, 0).astype(np.uint8)]), 'RGBA')

def strip(frames, name):
  """Bottom-centre every frame on one canvas, trim to the union, save."""
  W = max(f.width for f in frames); H = max(f.height for f in frames)
  canvas = []
  for f in frames:
    c = Image.new('RGBA', (W, H)); c.alpha_composite(f, ((W - f.width) // 2, H - f.height)); canvas.append(c)
  bbs = [c.getbbox() for c in canvas if c.getbbox()]
  u = (min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs))
  canvas = [c.crop(u) for c in canvas]
  w, h = canvas[0].size
  st = Image.new('RGBA', (w * len(canvas), h))
  for i, c in enumerate(canvas): st.alpha_composite(c, (i * w, 0))
  st.save(OUT + name + '.webp', 'WEBP', lossless=True)
  if PREV: st.resize((st.width * 3, st.height * 3), Image.NEAREST).save(f'{PREV}/{name}.png')
  return {'w': w, 'h': h, 'frames': len(canvas)}

meta = {}
# The larva: one facing (column 4 is side-on) through its 5 wriggle rows.
meta['larva'] = strip([cell(R[f'larva{i}'][4]) for i in range(5)], 'larva')
meta['curl'] = strip([cell(b) for b in R['curl']], 'curl')
meta['egg'] = strip([cell(b) for b in R['egg']], 'egg')
meta['prebirth'] = strip([cell(b) for b in R['prebirth']], 'prebirth')
# Births: the rows already draw the egg's broken base, so the "lower layer" row isn't needed.
for unit in ['zergling', 'hydralisk', 'mutalisk', 'queen', 'defiler', 'ultralisk']:
  frames = [cell(b) for b in R[unit]]
  meta['hatch-' + unit] = strip(frames, 'hatch-' + unit)
  last = frames[-1]
  if unit in ('mutalisk', 'queen'):
    # Keep the rows above the first empty gap under the creature.
    rows = (np.array(last)[..., 3] > 0).sum(1)
    top = int(np.argmax(rows > 0))
    gap = top + int(np.argmax(rows[top:] == 0))
    last = last.crop((0, 0, last.width, gap))
  meta['idle-' + unit] = strip([last], 'idle-' + unit)
print(json.dumps(meta))
