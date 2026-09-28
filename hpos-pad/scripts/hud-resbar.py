import numpy as np
from PIL import Image, ImageOps, ImageDraw
im=Image.open('uikit3.png').convert('RGBA'); F=2.56
y0,y1=round(841*F),round(901*F)
body=im.crop((round(20*F),y0,round(436*F),y1))
cap=im.crop((round(20*F),y0,round(56*F),y1))
capR=ImageOps.mirror(cap)
W=body.width+capR.width-round(6*F)
out=Image.new('RGBA',(W,body.height),(0,0,0,0))
out.alpha_composite(body,(0,0))
# blend the seam: paste mirrored cap over the body's last columns
out.alpha_composite(capR,(W-capR.width,0))
a=np.array(out)
# wipe the sample numbers (3250 / 864 / 54/62) with the bar's own interior colour
d=ImageDraw.Draw(out)
def wipe(x0,x1):
  X0,X1=round((x0-20)*F),round((x1-20)*F)
  col=tuple(int(v) for v in np.median(a[round(28*F/2.56*2.56/2.56*1):,:,:][0:1].reshape(-1,4)[:,:3],0))
for x0,x1 in ((86,150),(220,270),(356,436)):
  X0,X1=round((x0-20)*F),round((x1-20)*F)
  col=tuple(int(v) for v in np.median(a[round(20*F):round(40*F), X0-12:X0-4,:3].reshape(-1,3),0))
  d.rectangle((X0,round(12*F),min(X1,W-capR.width+round(8*F)),round(48*F)),fill=col+(255,))
# a vertical strip of 1px transparent pixels outside the rounded frame is fine; save at ~900px wide
h=round(out.height*900/out.width)
out.resize((900,h),Image.LANCZOS).save('/Users/rez/Desktop/memes/hpos10/hpos-pad/apps/web/public/hud/resbar.webp','WEBP',quality=90,method=6)
out.resize((900,h),Image.LANCZOS).save('resbar2-prev.png'); print(900,h)
