# planche réel / synthèse : onde 0-25 ms, enveloppe 0-1.5 s, spectrogramme. usage : voir2.py sortie.png reel.wav synth.wav [reel2 synth2 …]
import sys, numpy as np, scipy.signal as sg, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.io import wavfile
SR=48000
def lire(f):
    sr,x=wavfile.read(f); x=x.astype(np.float64); x=x.mean(1) if x.ndim==2 else x; x=x/np.abs(x).max()
    b,a=sg.butter(2,50/(SR/2),'high'); x=sg.lfilter(b,a,x); x/=np.abs(x).max()
    i=np.argmax(np.abs(x)>0.0316); i=max(0,i-int(.0005*SR)); return x[i:]
def env(x,ms): w=max(1,int(SR*ms/1000)); return 10*np.log10(np.convolve(x**2,np.ones(w)/w,"same")+1e-14)
fs=sys.argv[2:]; fig,ax=plt.subplots(len(fs),3,figsize=(18,2.3*len(fs)))
for k,f in enumerate(fs):
    s=lire(f); t=np.arange(len(s))/SR*1000; n=int(.025*SR)
    ax[k,0].plot(t[:n],s[:n],lw=.6); ax[k,0].set_title(f.split('/')[-1]); ax[k,0].grid(alpha=.3)
    m=int(1.5*SR); e=env(s[:m],5); ax[k,1].plot(t[:len(e)]/1000,e-e.max()); ax[k,1].set_ylim(-90,0); ax[k,1].grid(alpha=.3)
    f_,tt,S=sg.spectrogram(s[:int(1.0*SR)],SR,nperseg=512,noverlap=448)
    ax[k,2].pcolormesh(tt,f_,10*np.log10(S+1e-14),vmin=10*np.log10(S.max())-90,shading='auto',cmap='magma'); ax[k,2].set_yscale('symlog',linthresh=500); ax[k,2].set_ylim(50,24000)
plt.tight_layout(); plt.savefig(sys.argv[1],dpi=62)
