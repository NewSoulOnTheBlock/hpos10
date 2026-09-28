from PIL import Image, ImageDraw
import numpy as np
def clear_center(src,dst,inset=0.17,sample=(0.14,0.5)):
  im=Image.open(f'kit/{src}.png').convert('RGBA'); w,h=im.size
  a=np.array(im)
  # sample the button's inner background just inside the rim, median over a small patch
  sx,sy=int(w*sample[0]),int(h*sample[1])
  patch=a[sy-4:sy+4, sx-2:sx+3,:3].reshape(-1,3)
  col=tuple(int(v) for v in np.median(patch,0))
  d=ImageDraw.Draw(im); d.rounded_rectangle((w*inset,h*inset,w*(1-inset),h*(1-inset)),radius=int(w*0.06),fill=col+(255,))
  im.save(f'kit/{dst}.png'); return col
print(clear_center('st-normal','btn-normal'))
print(clear_center('st-hover','btn-hover'))
print(clear_center('st-pressed','btn-pressed'))
print(clear_center('st-disabled','btn-disabled'))
# resource bar: wipe the sample numbers
im=Image.open('kit/resbar.png').convert('RGBA'); a=np.array(im); d=ImageDraw.Draw(im)
for x0,x1 in ((158,330),(500,630),(855,1050)):
  col=tuple(int(v) for v in np.median(a[60:90, x0-10:x0-4,:3].reshape(-1,3),0))
  d.rectangle((x0,28,x1,118),fill=col+(255,))
im.save('kit/resbar-clean.png')
