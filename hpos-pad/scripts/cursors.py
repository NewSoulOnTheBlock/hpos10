import numpy as np, json
from PIL import Image
a=np.array(Image.open('cur.png').convert('RGB')).astype(int)
def cell(col,row):
  x=2+44*col; y=[2,48,94,140,186,232][row]
  t=a[y+3:y+40,x+3:x+40]
  white=(np.abs(t-t[1,1]).sum(2)<60)
  im=Image.fromarray(np.dstack([t.astype(np.uint8),np.where(white,0,255).astype(np.uint8)]),'RGBA')
  bb=im.getbbox(); return im.crop(bb)
out={}
def save(name,im,hot):
  # 2x, nearest, capped at 64px; hotspot scaled
  s=2 if max(im.size)*2<=64 else 1
  im=im.resize((im.width*s,im.height*s),Image.NEAREST); im.save(f'/Users/rez/Desktop/memes/hpos10/hpos-pad/apps/web/public/cursors/{name}.png')
  out[name]=[im.width,im.height,round(hot[0]*s),round(hot[1]*s)]
arrow=cell(0,0); save('arrow',arrow,(0,0))
sel=cell(0,1); save('select',sel,(sel.width/2,sel.height/2))
for name,col in (('down',0),('left',4),('up',8),('right',12)):
  im=cell(col,5); w,h=im.size
  hot={'down':(w/2,h-1),'left':(0,h/2),'up':(w/2,0),'right':(w-1,h/2)}[name]
  save('scroll-'+name,im,hot)
print(json.dumps(out))
