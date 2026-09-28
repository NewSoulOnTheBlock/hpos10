import numpy as np
from PIL import Image
a=np.array(Image.open('/Users/rez/Desktop/memes/hpos10/starcraft-ui/ui-kits/rug.png').convert('RGB')).astype(int)
cw=69
rows=[(262,312),(312,362)]
frames=[]
for y0,y1 in rows:
  for c in range(6):
    t=a[y0:y1,c*cw:(c+1)*cw]
    green=(t[...,1]>140)&(t[...,0]<130)&(t[...,2]<90); alpha=np.where((~green)&(t.sum(2)>45),255,0).astype(np.uint8)
    frames.append(Image.fromarray(np.dstack([t.astype(np.uint8),alpha]),'RGBA'))
# drop trailing empty frames
frames=[f for f in frames if f.getbbox()]
w,h=frames[0].size
st=Image.new('RGBA',(w*len(frames),h))
for i,f in enumerate(frames): st.alpha_composite(f,(i*w,0))
st.save('/Users/rez/Desktop/memes/hpos10/hpos-pad/apps/web/public/zerg/splat.webp','WEBP',lossless=True)
st.resize((st.width*3,st.height*3),Image.NEAREST).save('splat-prev.png'); print(len(frames),w,h)
