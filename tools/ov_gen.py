"""Озвучка через OmniVoice (движок VoiceStudio). Вход: JSON [{id, text, lang}] → voice/<id>.wav"""
import json, sys, os, time, torch, soundfile as sf
os.environ.setdefault('HF_HUB_OFFLINE', '1')
from omnivoice.models.omnivoice import OmniVoice
items = json.load(open(sys.argv[1]))
out = sys.argv[2]; os.makedirs(out, exist_ok=True)
INSTRUCT = os.environ.get('INSTRUCT', 'male, middle-aged, low pitch')
torch.set_num_threads(4)
model = OmniVoice.from_pretrained('k2-fsa/OmniVoice', device_map='cpu', dtype=torch.float32)
for it in items:
    path = os.path.join(out, it['id'] + '.wav')
    if os.path.exists(path) and not os.environ.get('FORCE'): continue
    t = time.time()
    kw = dict(text=it['text'], language=it.get('lang', 'ru'), num_step=int(os.environ.get('STEPS', '32')), speed=float(os.environ.get('SPEED', '0.95')))
    if it.get('ref'): kw.update(ref_audio=it['ref'], ref_text=it['ref_text'])
    else: kw['instruct'] = it.get('instruct', INSTRUCT)
    a = model.generate(**kw)[0]
    sf.write(path, a.squeeze(0).float().cpu().numpy() if a.dim() > 1 else a.float().cpu().numpy(), model.sampling_rate)
    print('OK', it['id'], round(time.time() - t, 1), 's', flush=True)
