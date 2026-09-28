# Cuts the Sproto Gremlins mosaic (1500x500 SVG rendered at 3000px) into 80
# avatars with their backgrounds removed. The web app uses them packed into
# apps/web/public/sproto-avatars.webp (10x8 grid, 112px cells).
import numpy as np
from PIL import Image
from collections import deque
src=np.array(Image.open('banner3000.png').convert('RGB')).astype(int)
cols=[44,228,410,589,770,953,1134,1318,1498,1678,1863,2044,2223,2405,2585,2769,2948]
rows=[0,183,364,545,727,908]
n=0; sheet=Image.new('RGBA',(16*100,5*100),(40,40,40,255))
for ri in range(5):
  for ci in range(16):
    x0,x1=cols[ci]+7,cols[ci+1]-6; y0,y1=rows[ri]+7,rows[ri+1]-6
    t=src[y0:y1,x0:x1]; h,w,_=t.shape
    # background colour: median of the top border
    border=np.concatenate([t[0:3].reshape(-1,3),t[:, :3].reshape(-1,3),t[:, -3:].reshape(-1,3)])
    bg=np.median(border,0)
    d=np.sqrt(((t-bg)**2).sum(2))
    cand=d<48
    seen=np.zeros((h,w),bool); q=deque()
    for x in range(w):
      if cand[0,x]: seen[0,x]=True; q.append((0,x))
    for y in range(h):
      for x in (0,w-1):
        if cand[y,x] and not seen[y,x]: seen[y,x]=True; q.append((y,x))
    while q:
      y,x=q.popleft()
      for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
        ny,nx=y+dy,x+dx
        if 0<=ny<h and 0<=nx<w and not seen[ny,nx] and cand[ny,nx]: seen[ny,nx]=True; q.append((ny,nx))
    alpha=np.where(seen,0,255).astype(np.uint8)
    fg=seen.mean()
    im=Image.fromarray(np.dstack([t.astype(np.uint8),alpha]),'RGBA').resize((160,160),Image.LANCZOS)
    im.save(f'tiles/g{n:02d}.png')
    sheet.alpha_composite(im.resize((96,96)),(ci*100+2,ri*100+2))
    n+=1
sheet.save('tiles-sheet.png'); print(n)
