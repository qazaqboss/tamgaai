"""Конвертер шежіре tumalas.kz (markdown-список) → data/tortkara.json
Формат: узел = "Имя" | "Имя…" (есть продолжение) | ["Имя", [дети]]"""
import re, json, sys
def parse(f):
    root = {'name': None, 'kids': [], 'more': False}; stack = [(-1, root)]
    for l in open(f, encoding='utf8'):
        m = re.match(r'^(\s*)- (.*?)\s*$', l)
        if not m: continue
        d = len(m.group(1)) // 2; name = m.group(2); more = name.endswith('…'); name = name.rstrip('…').strip()
        if not name: continue
        node = {'name': name, 'kids': [], 'more': more}
        while stack[-1][0] >= d: stack.pop()
        stack[-1][1]['kids'].append(node); stack.append((d, node))
    return root['kids'][0]
def comp(x):
    if not x['kids']: return x['name'] + ('…' if x['more'] else '')
    return [x['name'], [comp(k) for k in x['kids']]]
json.dump(comp(parse(sys.argv[1])), open(sys.argv[2], 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
