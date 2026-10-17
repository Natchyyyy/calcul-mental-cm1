# Découpe chaque tir d'un enregistrement (mono 48 kHz) : 5 ms avant l'attaque, 1.6 s après. Ignore les tirs trop proches.
import sys, os, json, numpy as np, scipy.signal as sg
from scipy.io import wavfile
SR=48000; AV=int(.3*SR); DUR=int(1.6*SR)
def env(x,ms): w=max(1,int(SR*ms/1000)); return 10*np.log10(np.convolve(x**2,np.ones(w)/w,"same")+1e-14)
src, dst = sys.argv[1], sys.argv[2]; os.makedirs(dst, exist_ok=True); n=0; info=[]
for f in sys.argv[3:]:
    sr,x=wavfile.read(os.path.join(src,f+".wav")); x=x.astype(np.float64)
    e=env(x,0.5); pk=e.max()
    idx,_=sg.find_peaks(e,height=pk-12,distance=int(1.0*SR),prominence=20)
    for k,i in enumerate(idx):
        i0=i
        while i0>0 and e[i0]>e[i]-40 and i-i0<int(.004*SR): i0-=1
        if k+1<len(idx) and idx[k+1]-i0 < DUR: continue
        if i0-AV<0 or i0+DUR>len(x): continue
        # bruit de fond avant : doit être bas
        pre=10*np.log10(np.mean(x[max(0,i0-int(.3*SR)):i0-AV]**2)+1e-14)-pk
        s=x[i0-AV:i0+DUR]; s=s/np.abs(s).max()
        wavfile.write(os.path.join(dst,f"{f}_{k}.wav"),SR,s.astype(np.float32)); n+=1; info.append((f,k,round(i0/SR,2),round(pre,1)))
print(dst, n, info)
