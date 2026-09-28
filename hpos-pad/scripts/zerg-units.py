import numpy as np
from PIL import Image, ImageDraw
a=np.array(Image.open('qb.png').convert('RGB')).astype(int)
cols=[2,38,74,110,146,182,218,254,290]; rows=[1470,1506,1542,1578,1614,1650,1686]
def cell(c,r):
  t=a[r:r+33,c:c+33].copy(); bgc=t[1,1]
  r_,g,b=t[...,0],t[...,1],t[...,2]
  isbg=(np.abs(t-bgc).sum(2)<40)
  mag=(r_>60)&(b>60)&(g<np.minimum(r_,b)*0.55)
  inten=((r_+b)/2/255.0)[...,None]
  t=np.where(mag[...,None],np.array([254,235,0])[None,None,:]*np.clip(inten*1.15,0,1),t)
  return Image.fromarray(np.dstack([t.astype(np.uint8),np.where(isbg,0,255).astype(np.uint8)]),'RGBA')
col=cols[8]
frames=[cell(col,r) for r in rows]
strip=Image.new('RGBA',(33*len(frames),33))
for i,f in enumerate(frames): strip.alpha_composite(f,(i*33,0))
strip.save('/Users/rez/Desktop/memes/hpos10/hpos-pad/apps/web/public/zerg/drone.webp','WEBP',lossless=True)
strip.resize((strip.width*4,strip.height*4),Image.NEAREST).save('drone-prev.png')

# Larva: hand-made pixel sprite in the same palette (4 wriggle frames, 24x16).
PAL={'o':(40,22,10),'b':(122,84,48),'l':(176,132,82),'h':(214,176,120),'y':(254,235,0),'r':(150,30,20)}
base=[
"....oooooooooo..........",
"..oollllhhhhllloo.......",
".olbbllllhhhhlllloo.....",
"oblbblbbllhhllbbllbo....",
"obbbblbbbllllbbbblbbo...",
"obbbblbbbblbbbbbblbbbo..",
".obbblbbbblbbbbbblbbbyo.",
"..oobobbbbobbbbbbobbbro.",
"....oo.oooo.oooo.ooooo..",
]
def larva(shift):
  im=Image.new('RGBA',(26,14),(0,0,0,0)); d=im.load()
  for y,row in enumerate(base):
    for x,ch in enumerate(row):
      if ch=='.': continue
      yy=y+2+(1 if (x//5+shift)%2 else 0)
      if 0<=yy<14 and x<26: d[x,yy]=PAL[ch]+(255,)
  return im
lf=[larva(s) for s in range(4)]
ls=Image.new('RGBA',(26*4,14))
for i,f in enumerate(lf): ls.alpha_composite(f,(i*26,0))
# Superseded: the real larva now comes from scripts/zerg-mobs.py (rug.png).
ls.resize((ls.width*6,ls.height*6),Image.NEAREST).save('larva-prev.png')
