"""Склейка озвучки гида: voice/parts/<story>_NN.wav → audio/guide/<story>.mp3 + данные субтитров в index.html"""
import json, os, re, subprocess, sys, numpy as np, soundfile as sf
REPO = '/home/user/tamgaai'; PARTS = '/tmp/claude-0/s/voice/parts'
stories = json.load(open('/tmp/claude-0/s/guide_stories.json'))
os.makedirs(f'{REPO}/audio/guide', exist_ok=True)
SR = 24000; GAP = 0.5
def trim(x, thr=0.012):
    a = np.abs(x); idx = np.where(a > thr)[0]
    if not len(idx): return x
    return x[max(0, idx[0] - int(0.04 * SR)): min(len(x), idx[-1] + int(0.12 * SR))]
data = []
for s in stories:
    segs, lines, t = [], [], 0.25
    ok = True
    for i, text in enumerate(s['text']):
        p = f'{PARTS}/{s["id"]}_{i:02d}.wav'
        if not os.path.exists(p):
            if os.environ.get('PARTIAL') and i > 0: break
            ok = False; break
        x, sr = sf.read(p); assert sr == SR
        if x.ndim > 1: x = x.mean(1)
        x = trim(x); x = x / (np.sqrt((x ** 2).mean()) + 1e-9) * 0.085      # выравнивание громкости
        x = np.clip(x, -0.98, 0.98)
        lines.append({'t': round(t, 2), 'text': text}); segs.append(x); segs.append(np.zeros(int(GAP * SR))); t += len(x) / SR + GAP
    if not ok: print('skip', s['id']); continue
    y = np.concatenate([np.zeros(int(0.25 * SR))] + segs)
    fade = int(0.01 * SR); y[:fade] *= np.linspace(0, 1, fade); y[-fade:] *= np.linspace(1, 0, fade)
    wav = f'/tmp/claude-0/s/voice/{s["id"]}.wav'; sf.write(wav, y.astype(np.float32), SR)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', 'highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,loudnorm=I=-17:TP=-1.5:LRA=9',
                    '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', f'{REPO}/audio/guide/{s["id"]}.mp3'], check=True)
    data.append({k: s[k] for k in ('id', 'icon', 'kk', 'ru', 'topic')} | {'dur': round(len(y) / SR, 1), 'lines': lines})
    print('built', s['id'], round(len(y) / SR, 1), 's')
p = f'{REPO}/index.html'; h = open(p, encoding='utf8').read()
h = re.sub(r'/\*GUIDE_DATA\*/.*?/\*END_GUIDE_DATA\*/', lambda m: '/*GUIDE_DATA*/' + json.dumps(data, ensure_ascii=False) + '/*END_GUIDE_DATA*/', h, flags=re.S)
open(p, 'w', encoding='utf8').write(h)
print('stories in site:', len(data))
