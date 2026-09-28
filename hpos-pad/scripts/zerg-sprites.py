import numpy as np, json
from PIL import Image
src=np.array(Image.open('zb.png').convert('RGB')).astype(int)
bg=np.array([35,35,255])
def frame(box):
  x0,y0,x1,y1=box
  a=src[y0:y1,x0:x1].copy(); r,g,b=a[...,0],a[...,1],a[...,2]
  isbg=(abs(r-bg[0])<24)&(abs(g-bg[1])<24)&(abs(b-bg[2])<24)
  mag=(r>60)&(b>60)&(g<np.minimum(r,b)*0.55)
  inten=((r+b)/2/255.0)[...,None]
  a=np.where(mag[...,None],np.array([254,235,0])[None,None,:]*np.clip(inten*1.15,0,1),a)
  return Image.fromarray(np.dstack([a.astype(np.uint8),np.where(isbg,0,255).astype(np.uint8)]),'RGBA')
# The egg now comes from scripts/zerg-mobs.py (rug.png).
defs={
 'hatchery':[(8+144*i,8,152+144*i,144) for i in range(4)],
 'lair':[(8+144*i,152,152+144*i,288) for i in range(4)],
 'hive':[(8+144*i,296,152+144*i,432) for i in range(4)],
}
meta={}
for name,boxes in defs.items():
  fr=[frame(b) for b in boxes]
  bbs=[f.getbbox() for f in fr]
  u=(min(b[0] for b in bbs),min(b[1] for b in bbs),max(b[2] for b in bbs),max(b[3] for b in bbs))
  fr=[f.crop(u) for f in fr]; w,h=fr[0].size
  strip=Image.new('RGBA',(w*4,h))
  for i,f in enumerate(fr): strip.alpha_composite(f,(i*w,0))
  strip.save(f'/Users/rez/Desktop/memes/hpos10/hpos-pad/apps/web/public/zerg/{name}.webp','WEBP',lossless=True)
  strip.save(f'zerg/{name}-strip.png'); meta[name]=[w,h]
print(json.dumps(meta))
