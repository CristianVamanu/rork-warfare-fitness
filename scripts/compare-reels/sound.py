"""Original sound design for the comparison reel (numpy only, no samples).
python sound.py out.wav [duration]"""
import sys, numpy as np, wave
SR = 48000; DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 26.0
N = int(SR * DUR); t = np.arange(N) / SR; mix = np.zeros((N, 2))
rng = np.random.default_rng(7)
def lp(x, a):  # one-pole low-pass, a in (0,1)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)): acc += a * (x[i] - acc); y[i] = acc
    return y
KT = DUR / 26.0  # the event times below are written for the 26 s cut
def put(sig, at, gain=1.0, pan=0.0):
    i = int(at * KT * SR); n = min(len(sig), N - i)
    if n <= 0: return
    mix[i:i+n, 0] += sig[:n] * gain * (1 - max(pan, 0)); mix[i:i+n, 1] += sig[:n] * gain * (1 + min(pan, 0))
# bed: low drone (A1 + E2) with slow movement, ducked under the end card
env = np.clip(t / 1.5, 0, 1) * np.clip((DUR - t) / 2.0, 0, 1)
bed = (np.sin(2*np.pi*55*t) * 0.5 + np.sin(2*np.pi*82.41*t + 0.3) * 0.28 + np.sin(2*np.pi*110*t) * 0.12)
bed *= (0.75 + 0.25 * np.sin(2*np.pi*0.11*t)) * env
air = lp(rng.standard_normal(N) * 0.5, 0.02) * env * 0.35
mix[:, 0] += bed * 0.16 + air * 0.6; mix[:, 1] += bed * 0.16 + air * 0.5
# pulse: soft kick every beat at 96 bpm from the first cut
beat = 60 / 96
def kick(L=0.35, f0=95, f1=42):
    tt = np.arange(int(L*SR)) / SR; f = f1 + (f0 - f1) * np.exp(-tt * 28)
    return np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-tt * 9)
k = kick()
b = 3.2
while b < 23.4:
    put(k, b, 0.32); b += beat
# hat-like tick on off-beats in the breakdown, very low
def tick(L=0.03, f=3200, g=1.0):
    tt = np.arange(int(L*SR)) / SR
    return (np.sin(2*np.pi*f*tt) * 0.6 + rng.standard_normal(len(tt)) * 0.4) * np.exp(-tt * 140) * g
b = 3.2 + beat / 2
while b < 23.4:
    put(tick(f=6000) * 0.5, b, 0.12, pan=0.3); b += beat
# transitions: riser + sub impact
def riser(L=0.55):
    n = int(L*SR); x = rng.standard_normal(n); tt = np.arange(n)/n
    y = lp(x, 0.02) * 0 + np.concatenate([lp(x[:n//2], 0.05), lp(x[n//2:], 0.2)])
    return y * tt**2.2 * 0.8
def impact(L=1.2):
    tt = np.arange(int(L*SR)) / SR
    sub = np.sin(2*np.pi*(38 + 30*np.exp(-tt*12))*tt) * np.exp(-tt * 3.2)
    body = lp(rng.standard_normal(len(tt)), 0.08) * np.exp(-tt * 14) * 0.6
    return sub + body
for at in (3.2, 10.6, 18.0, 23.6):
    put(riser(), at - 0.55, 0.35); put(impact(), at, 0.55)
put(impact(1.6), 0.0, 0.45)
# UI ticks for each text reveal
for at in (0.15, 0.6, 3.35, 4.4, 6.0, 7.6, 10.75, 11.8, 13.4, 15.0, 18.3, 19.4, 21.0):
    put(tick(0.05, 2400, 1.0), at, 0.22); put(tick(0.03, 4800, 0.5), at, 0.22)
for base in (8.8, 16.2):
    for i in range(3):
        for j in range(5):
            put(tick(0.02, 3600 + 300 * j, 0.6), base + i*0.2 + j*0.1, 0.08, pan=-0.3 + 0.3*i)
# end: soft low chord swell
_e = 23.6 * KT
tt = t[t >= _e] - _e
ch = sum(np.sin(2*np.pi*f*tt) for f in (55, 82.41, 110, 164.8)) * np.clip(tt/0.8, 0, 1) * np.exp(-tt*0.9) * 0.08
mix[t >= _e, 0] += ch; mix[t >= _e, 1] += ch
mix /= np.max(np.abs(mix)) / 0.89
pcm = (mix * 32767).astype('<i2')
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
