"""«Дала самалы» — фоновая петля: домбыра (Карплус–Стронг), бурдон, ветер, реверберация. Оригинальная композиция."""
import numpy as np, sys
SR = 44100
rng = np.random.default_rng(7)
BPM = 76; E8 = 60 / BPM / 2          # длительность восьмой
BARS = 32; L = int(SR * (BARS * 8 * E8 + 4))
out = np.zeros((L, 2))

def midi(n): return 440 * 2 ** ((n - 69) / 12)
def pluck(freq, dur, bright=0.5, amp=0.3):
    N = int(SR / freq); n = int(SR * dur)
    buf = rng.uniform(-1, 1, N); buf = np.convolve(buf, [0.5, 0.5], 'same') * (1 - bright) + buf * bright
    y = np.zeros(n); idx = 0; dec = 0.9965 - 0.0008 * (freq / 440)
    for i in range(n):
        v = buf[idx]; nxt = buf[(idx + 1) % N]; buf[idx] = dec * 0.5 * (v + nxt); y[i] = v; idx = (idx + 1) % N
    # корпус-резонатор: два мягких «форманта»
    f = np.fft.rfft(y); fr = np.fft.rfftfreq(n, 1 / SR)
    body = 0.6 + 0.9 * np.exp(-((fr - 260) / 120) ** 2) + 0.5 * np.exp(-((fr - 900) / 300) ** 2) + 0.15 * np.exp(-((fr - 2600) / 900) ** 2)
    y = np.fft.irfft(f * body * (fr < 7000), n)
    att = np.minimum(1, np.arange(n) / (SR * 0.003))
    return y * att * amp
cache = {}
def note(t, m, dur=1.4, amp=0.3, pan=0.0, bright=0.45):
    key = (m, round(dur, 2), round(bright, 2))
    if key not in cache: cache[key] = pluck(midi(m), dur, bright, 1)
    y = cache[key] * amp * (0.92 + 0.16 * rng.random())
    i = int(t * SR); j = min(L, i + len(y)); y = y[:j - i]
    out[i:j, 0] += y * (1 - pan) * 0.7; out[i:j, 1] += y * (1 + pan) * 0.7

# лад: ре дорийский (D E F G A B C), домбыра: D3 и G3 (кварта)
SC = {1: 62, 2: 64, 3: 65, 4: 67, 5: 69, 6: 71, 7: 72, 8: 74, 9: 76, 10: 77, 0: 60, -1: 57}
# мелодия по тактам (8 восьмых; None — пауза/держим); две части A и B
A = [[5, None, 4, 5, 3, None, 2, None], [1, None, None, 2, 3, 2, 1, None], [5, None, 6, 5, 4, None, 3, 4], [5, None, None, None, 5, 4, 3, 2],
     [1, None, 2, 3, 4, None, 3, None], [2, 1, 2, None, 0, None, -1, None], [1, None, 3, 5, 6, 5, 4, 3], [2, None, 1, None, 1, None, None, None]]
B = [[8, None, 7, 8, 6, None, 5, None], [6, 7, 8, None, 9, 8, 7, None], [8, None, 6, 5, 4, None, 5, 6], [5, None, None, None, 5, 6, 5, 4],
     [3, None, 4, 5, 6, None, 5, 4], [3, 2, 1, None, 2, None, 3, None], [5, None, 4, 3, 2, None, 1, 0], [1, None, None, None, 1, None, None, None]]
FORM = A + A + B + A          # 32 такта
BASS = [50, 50, 48, 50, 53, 48, 50, 50] * 4  # корневые басы по тактам (D2/C2/F2)
t0 = 2.0
for b, bar in enumerate(FORM):
    for k in range(8):
        t = t0 + (b * 8 + k) * E8 + (0.012 if k % 2 else 0) + rng.normal(0, 0.004)
        # «қағыс»: нижняя струна — открытая D3 на каждой доле, лёгкая на слабых
        acc = 1.0 if k in (0, 3, 6) else 0.55
        note(t, 50 if b % 8 not in (2, 5) else 48, 1.1, 0.085 * acc, -0.25, 0.35)
        m = bar[k]
        if m is not None:
            note(t + 0.008, SC[m], 1.6, 0.16 * (1.1 if k in (0, 4) else 0.9), 0.2, 0.55)
            if k == 0 and rng.random() < 0.5: note(t + E8 * 0.5, SC[m] + 2, 0.4, 0.05, 0.25, 0.6)   # форшлаг-украшение
# бурдон/пэд: мягкие аккорды
def pad(t, notes, dur, amp):
    n = int(SR * dur); tt = np.arange(n) / SR; y = np.zeros(n)
    for m in notes:
        f = midi(m)
        for det in (-0.12, 0.0, 0.11): y += np.sin(2 * np.pi * f * (1 + det / 100) * tt) * 0.33
    env = np.minimum(1, tt / 2.5) * np.minimum(1, (dur - tt) / 2.5)
    y *= env * amp; i = int(t * SR); j = min(L, i + n)
    out[i:j, 0] += y[:j - i]; out[i:j, 1] += y[:j - i] * 0.95
CH = [[50, 57, 62], [48, 55, 64], [53, 57, 60], [45, 50, 57]]
bar_d = 8 * E8
for b in range(0, BARS, 2): pad(t0 + b * bar_d - 0.5, CH[(b // 2) % 4], bar_d * 2 + 1.0, 0.028)
# ветер: фильтрованный шум с медленным «дыханием»
w = rng.normal(0, 1, L); W = np.fft.rfft(w); fr = np.fft.rfftfreq(L, 1 / SR)
w = np.fft.irfft(W * np.exp(-((fr - 450) / 380) ** 2), L); w /= np.abs(w).max()
lfo = 0.5 + 0.5 * np.sin(2 * np.pi * np.arange(L) / SR / 11 + 1) * np.sin(2 * np.pi * np.arange(L) / SR / 4.3)
out[:, 0] += w * lfo * 0.035; out[:, 1] += np.roll(w, 3000) * lfo * 0.035
# реверберация: экспоненциальный шумовой отклик
ir_len = int(SR * 2.6); tt = np.arange(ir_len) / SR
for c in range(2):
    ir = rng.normal(0, 1, ir_len) * np.exp(-tt / 0.75); ir[:int(SR * 0.02)] = 0; ir /= np.sqrt((ir ** 2).sum())
    n = 1 << int(np.ceil(np.log2(L + ir_len)))
    wet = np.fft.irfft(np.fft.rfft(out[:, c], n) * np.fft.rfft(ir, n), n)[:L]
    out[:, c] = out[:, c] * 0.78 + wet * 0.42
# срез гула ниже ~90 Гц
for c in range(2):
    F = np.fft.rfft(out[:, c]); fr2 = np.fft.rfftfreq(L, 1 / SR); F *= 1 / (1 + (90 / np.maximum(fr2, 1)) ** 4); out[:, c] = np.fft.irfft(F, L)
# бесшовная петля: хвост реверба накладываем на начало
loop_len = int(SR * (t0 + BARS * bar_d))
tail = out[loop_len:].copy(); res = out[:loop_len].copy(); res[:len(tail)] += tail
fade = int(SR * 2.0); res[:fade] *= np.linspace(0.0, 1, fade)[:, None] ** 0.5 if False else 1
res /= np.abs(res).max() / 0.8
import soundfile as sf
sf.write(sys.argv[1], res.astype(np.float32), SR)
print('len', loop_len / SR)
