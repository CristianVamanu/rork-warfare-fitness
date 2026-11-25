import sys,cv2,numpy as np,os
src,dst,size=sys.argv[1],sys.argv[2],int(sys.argv[3]);os.makedirs(dst,exist_ok=True)
c=cv2.VideoCapture(src);fr=[]
while True:
    ok,f=c.read()
    if not ok:break
    fr.append(f)
print(len(fr),'corner',fr[0][5,5],fr[0][-5,-5])
m=np.zeros(fr[0].shape[:2],bool)
for f in fr[::4]: m|=(f.min(2)<235)
ys,xs=np.where(m);x0,x1,y0,y1=xs.min(),xs.max(),ys.min(),ys.max()
s=int(max(x1-x0,y1-y0)*1.10);cx,cy=(x0+x1)//2,(y0+y1)//2
print('bbox',x0,x1,y0,y1,'side',s)
for i,f in enumerate(fr):
    f=f.astype(np.float32);f=np.clip(f*(255/float(fr[0][5,5].min())),0,255).astype(np.uint8)
    cv=np.full((s,s,3),255,np.uint8);H,W=f.shape[:2]
    sx,sy=cx-s//2,cy-s//2
    a0,b0=max(0,sx),max(0,sy);a1,b1=min(W,sx+s),min(H,sy+s)
    cv[b0-sy:b1-sy,a0-sx:a1-sx]=f[b0:b1,a0:a1]
    cv2.imwrite(f'{dst}/f_{i:04d}.jpg',cv2.resize(cv,(size,size),interpolation=cv2.INTER_LANCZOS4),[cv2.IMWRITE_JPEG_QUALITY,93])
