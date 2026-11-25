"""standing_man.glb → models/rider/rider.glb: текстуры → JPEG ≤ 1024 px. Геометрия, скелет, материалы не меняются."""
import json, struct, io, sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
jl = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20 + jl])
bin_off = 20 + jl; bl = struct.unpack_from('<I', b, bin_off)[0]; BIN = b[bin_off + 8: bin_off + 8 + bl]
views = [BIN[v.get('byteOffset', 0): v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
for im in j['images']:
    bv = im['bufferView']; img = Image.open(io.BytesIO(views[bv]))
    alpha = img.mode in ('RGBA', 'LA') and img.getchannel('A').getextrema()[0] < 250
    if alpha: continue  # ресницы и т.п. с прозрачностью — оставляем как есть
    img = img.convert('RGB'); m = max(img.size)
    if m > 1024: img = img.resize((img.width * 1024 // m, img.height * 1024 // m), Image.LANCZOS)
    o = io.BytesIO(); img.save(o, 'JPEG', quality=86); views[bv] = o.getvalue(); im['mimeType'] = 'image/jpeg'
out = bytearray()
for v, data in zip(j['bufferViews'], views):
    while len(out) % 4: out += b'\0'
    v['byteOffset'] = len(out); v['byteLength'] = len(data); out += data
while len(out) % 4: out += b'\0'
j['buffers'] = [{'byteLength': len(out)}]
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(out)) + b'BIN\0' + bytes(out)
open(dst, 'wb').write(glb); print(len(b) // 1024, 'KB ->', len(glb) // 1024, 'KB')
