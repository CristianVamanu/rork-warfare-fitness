"""Original score for the 74 s film (numpy only). python score.py out.wav
Follows the cut: rumble (0-7), pulse enters with dark mode (7), fuller pulse (18),
riser into the dark-to-light wipe with an impact at 33.5, a brighter major pad
in the light section (35.5-51), build (51-64), final impact at 64, resolve."""
import sys, wave, numpy as np
SR=48000; DUR=74.0; N=int(SR*DUR); t=np.arange(N)/SR; rng=np.random.default_rng(3)
def env(a,b,fi=1.0,fo=1.0): return np.clip((t-a)/fi,0,1)*np.clip((b-t)/fo,0,1)
def lp(x,k):  # crude low-pass by moving average
    return np.convolve(x,np.ones(k)/k,mode='same')
L=np.zeros(N); R=np.zeros(N)
def add(sig,pan=0.0,g=1.0):
    global L,R; L+=sig*g*(1-max(pan,0)); R+=sig*g*(1+min(pan,0))
def tone(f,ph=0): return np.sin(2*np.pi*f*t+ph)
# deep bed: D1/A1 drone, slow movement
bed=(tone(36.71)*.55+tone(55.0,.4)*.35+tone(73.42,1.1)*.18)*(.8+.2*np.sin(2*np.pi*.07*t))
add(bed*env(0,DUR,3,3),0,.5)
add(lp(rng.standard_normal(N),900)*env(0,DUR,4,3)*6,0,.5)          # rumble / air
# dark pad (D minor), light pad (D major), cross-faded at the wipe
def pad(fs,det=.3): return sum(tone(f)+tone(f+det,1)+tone(f*2,.5)*.3 for f in fs)/len(fs)
dark=pad([146.83,174.61,220.0]); light=pad([146.83,185.0,220.0,293.66])
add(dark*env(5,35.5,4,2.5)*.5,-.15,.16); add(dark*env(64,DUR,.6,3)*.5,.15,.2)
add(light*env(33.5,66,2.5,2.5),.15,.15)
# pulse: eighth notes at 100 bpm, opening filter over time
beat=60/100/2
def pulse(a,b,f,g,pan):
    ph=((t-a)%beat)/beat; e=np.exp(-ph*7)*env(a,b,1.5,.4)
    add((np.sign(tone(f))*.25+tone(f)*.75)*e,pan,g)
pulse(7,29.5,73.42,.12,-.2); pulse(18,29.5,146.83,.07,.25)
pulse(40,64,73.42,.10,.2); pulse(51,64,220.0,.05,-.25); pulse(51,64,293.66,.04,.3)
# kick-like hits on scene changes, big ones at the wipe and the finale
def hit(at,g=1.0,low=48):
    d=t-at; m=(d>=0)&(d<2.5); x=np.zeros(N)
    x[m]=np.sin(2*np.pi*(low+70*np.exp(-d[m]*18))*d[m])*np.exp(-d[m]*2.6)
    n=np.zeros(N); n[m]=rng.standard_normal(m.sum())*np.exp(-d[m]*9)
    add(x,0,.55*g); add(lp(n,40),0,.9*g)
for at,g in [(7,.7),(18,.6),(33.5,1.0),(40,.55),(51,.7),(64,1.1)]: hit(at,g)
# risers into the wipe and into the finale
def riser(a,b,g):
    d=np.clip((t-a)/(b-a),0,1); m=(t>=a)&(t<b); x=np.zeros(N)
    x[m]=(rng.standard_normal(m.sum())*.5+np.sin(2*np.pi*np.cumsum(200+1400*d[m]**2)/SR)*.5)*d[m]**2
    add(lp(x,6),-.2,g); add(lp(np.roll(x,400),6),.2,g)
riser(29.5,33.5,.22); riser(60.5,64,.24)
# small interface ticks on each screen change
ticks=[7+2.2*i for i in range(1,5)]+[23.2]+[40+11/3*i for i in range(1,3)]+[52+2.85*i for i in range(4)]
for at in ticks:
    d=t-at; m=(d>=0)&(d<.08); x=np.zeros(N); x[m]=np.sin(2*np.pi*2400*d[m])*np.exp(-d[m]*60); add(x,.3,.06)
mix=np.stack([L,R],1); mix*=env(0,DUR,.05,1.6)[:,None]; mix=np.tanh(mix*1.5); mix/=np.max(np.abs(mix))/.89
with wave.open(sys.argv[1],'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype('<i2').tobytes())
print('wrote',sys.argv[1])
