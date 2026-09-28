from PIL import Image
im=Image.open('uikit3.png').convert('RGBA')
F=2.56
crops={
 'minimap':(22,342,322,578),'info':(345,357,1216,578),'portrait':(1237,342,1442,578),'command':(1467,342,1782,583),
 'resbar':(25,845,462,900),
 'ic-move':(32,945,102,1008),'ic-stop':(130,945,200,1008),'ic-attack':(230,945,300,1008),'ic-hold':(330,945,400,1008),
 'ic-patrol':(430,945,500,1008),'ic-ab1':(528,945,600,1008),'ic-ab2':(628,945,700,1008),'ic-ab3':(730,945,800,1008),
 'st-normal':(888,945,960,1008),'st-hover':(988,945,1060,1008),'st-pressed':(1088,945,1160,1008),'st-disabled':(1188,945,1260,1008),
 'slot-empty':(438,1080,500,1143),
 'sb-check':(1346,958,1387,1002),'sb-menu':(1568,958,1612,1002),'sb-chat':(1626,958,1670,1002),'sb-alert':(1683,958,1725,1002),'sb-gear':(1738,958,1779,1002),
 'hp':(708,855,910,893),'shield':(952,855,1142,893),'progress':(1182,855,1420,893),
 'tooltip':(1460,835,1778,913),
}
for k,(a,b,c,d) in crops.items():
  im.crop((round(a*F),round(b*F),round(c*F),round(d*F))).save(f'kit/{k}.png')
# contact sheet
sheet=Image.new('RGBA',(1800,1400),(40,40,60,255)); x=y=0; rowh=0
for k in crops:
  t=Image.open(f'kit/{k}.png'); t.thumbnail((440,300))
  if x+t.width>1800: x=0; y+=rowh+10; rowh=0
  sheet.alpha_composite(t,(x,y)); x+=t.width+10; rowh=max(rowh,t.height)
sheet.save('kit-sheet.png')
