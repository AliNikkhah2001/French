import urllib.request, ssl, sys, re, time, html, io, os
sys.stdout.reconfigure(encoding='utf-8')
ctx = ssl.create_default_context()
HDR = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'}
OUT = 'content'
os.makedirs(OUT, exist_ok=True)

FRENCH_STOP = set("""je tu il elle on nous vous ils elles le la les un une des de du d' l' j' n' m' t' s' c' et ou mais
qui que quoi dont dans sur avec pour par pas plus ne en au aux a ai es est sont être avoir ce cette ces mon ma mes ton ta
tes son sa ses notre votre leur nos vos leurs si se sa beaucoup bien très peu tout tous tout aussi comment quand où pourquoi
comment aller bonjour merci""".split())

def get(url):
    req = urllib.request.Request(url, headers=HDR)
    return urllib.request.urlopen(req, timeout=60, context=ctx).read().decode('utf-8', 'replace')

def french_ratio(text):
    words = re.findall(r"[a-zA-ZÀ-ÿ']+", text.lower())
    if not words:
        return 0
    return sum(1 for w in words if w in FRENCH_STOP) / len(words)

def clean(s):
    return html.unescape(s).replace('\u2019', "'").replace('\u00a0', ' ').strip()

# 1) episode slug list from the paginated podcast index
slugs = []
page = 1
while True:
    url = 'https://podcast.duolingo.com/french' + ('.html' if page == 1 else f'{page}.html')
    try:
        txt = get(url)
    except Exception as e:
        print('index err', page, e); break
    found = re.findall(r'\./episode-([0-9]+-[\w-]+)', txt)
    if not found:
        break
    slugs += found
    if len(found) < 5:
        break
    page += 1
    if page > 30:
        break
    time.sleep(0.3)
print('episodes found:', len(slugs))
slugs = sorted(set(slugs), key=lambda s: int(s.split('-')[0]))
if len(sys.argv) > 1:
    slugs = slugs[:int(sys.argv[1])]

# 2) build lessons
generated = skipped = 0
for slug in slugs:
    url = f'https://podcast.duolingo.com/episode-{slug}'
    try:
        txt = get(url)
    except Exception as e:
        print('page err', slug, str(e)[:70]); skipped += 1; continue
    # title
    mt = re.search(r'<title>(.*?)</title>', txt, re.S)
    title = clean(mt.group(1)) if mt else slug
    title = re.sub(r'\s*[-–]\s*Duolingo\s*$', '', title)
    num = re.match(r'Episode\s*(\d+)', title)
    # french title (parenthesized)
    fr_title = re.search(r'\((...*?)\)\s*(?:[-–]\s*Revisited)?\s*$', title)
    front_title = (fr_title.group(1) if fr_title else title).strip()
    if (fr_title and fr_title.group(1)) and num:
        front_title = front_title
    elif num:
        front_title = title.replace(f'Episode {num.group(1)}: ', '')
    # description
    meta = re.search(r'<meta\s+name="description"\s+content="([^"]+)"', txt)
    desc = clean(html.unescape(meta.group(1))) if meta else ''
    # audio embed
    audio_embed = ''
    ifm = re.search(r'<iframe[^>]*src="(//html5-player\.libsyn\.com[^"]+|https://html5-player\.libsyn\.com[^"]+)"', txt)
    if not ifm:
        ifm = re.search(r'src="(//html5-player\.libsyn\.com[^"]+)"', txt)
    if ifm:
        audio_embed = 'https:' + ifm.group(1) if ifm.group(1).startswith('//') else ifm.group(1)
    # transcript pairs
    rows = []
    tr = re.search(r'>\s*Transcript\s*</h2>(.*?)(<h2|$)', txt, re.S)
    if tr:
        paras = re.findall(r'<p>\s*(?:<strong[^>]*>([^<]+)</strong>:\s*)?(.*?)</p>', tr.group(1), re.S)
        last_en = ''
        for speaker, body in paras:
            text = clean(re.sub(r'<[^>]+>', ' ', body))
            if not text:
                continue
            spk = ''
            m = re.match(r'^([A-Za-zÀ-ÿ]+)\s*:\s*(.*)$', text)
            if m:
                spk, text = m.group(1).strip(), m.group(2).strip()
            is_fr = french_ratio(text) >= 0.25
            if is_fr:
                en = last_en or ''
                rows.append((text, en, spk))
                last_en = ''
            else:
                last_en = text
    rows = rows[:60]
    # frontmatter
    order = num.group(1) if num else '99'
    lines = [
        '---',
        f'title: "{clean(front_title).replace(chr(34), "")}"'.replace("'", "'"),
        f'slug: "episode-{slug}"'.replace("'", "'"),
        'type: "podcast"',
        'level: "A2–B1"',
        'emoji: "🎙️"',
        f'description: "{clean(desc)[:220].replace(chr(34), "")}"',
        'author: "Duolingo French Podcast"',
        'duration: "intermediate"',
        f'order: {order}',
        'tags: [podcast, listening, stories]',
        f'source_url: "https://podcast.duolingo.com/episode-{slug}"',
        'apple_url: "https://podcasts.apple.com/us/podcast/duolingo-french-podcast/id1466824259"',
        'audio_url: ""',
        f'audio_embed: "{audio_embed}"',
        'draft: false',
        '---',
        '',
        '# Overview',
        '',
        clean(desc),
        ''
    ]
    if rows:
        lines += ['# Transcript', '', '| French | English | Notes |', '|---|---|---|']
        for fr, en, spk in rows:
            f = fr.replace('|', '\\|')
            e = (en[:240] or '—').replace('|', '\\|')
            note = f'`{spk}`' if spk else ''
            lines.append(f'| {f} | {e} | {note} |')
        lines.append('')
    md = '\n'.join(lines)
    # slug may have leading zero episodes etc; filename
    path = os.path.join(OUT, f'episode-{slug}.md')
    if os.path.exists(path):
        print('skip (exists)', num.group(1) if num else '?')
        continue
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(md)
    generated += 1
    print('ok', num.group(1) if num else '?', front_title[:40], 'rows', len(rows))
    time.sleep(0.25)

print(f'\nDONE generated={generated} skipped={skipped}')