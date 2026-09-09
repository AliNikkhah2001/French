import urllib.request, ssl, sys, re, time, html, io, os
sys.stdout.reconfigure(encoding='utf-8')
ctx = ssl.create_default_context()
HDR = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'}
OUT = 'content'
os.makedirs(OUT, exist_ok=True)

FRENCH_STOP = set("""je tu il elle on nous vous ils elles le la les un une des de du d' l' j' n' m' t' s' c' et ou mais
qui que quoi dont dans sur avec pour par pas plus ne en au aux a ai es est sont être avoir ce cette ces mon ma mes ton ta
tes son sa ses notre votre leur nos vos leurs si se sa beaucoup bien très peu tout tous tout aussi comment quand où pourquoi""".split())

def get(url):
    req = urllib.request.Request(url, headers=HDR)
    return urllib.request.urlopen(req, timeout=60, context=ctx).read().decode('utf-8', 'replace')

def french_ratio(text):
    words = re.findall(r"[a-zA-ZÀ-ÿ']+", text.lower())
    if not words:
        return 0
    return sum(1 for w in words if w in FRENCH_STOP) / len(words)

def clean(s):
    return html.unescape(s).replace('\u2019', "'").replace('\u00a0', ' ').replace('\u201c', '«').replace('\u201d', '»').strip()

def series_of(num, title):
    t = title.lower()
    if 'rebel thief' in t:
        return 'The Rebel Thief'
    if 'josephine baker' in t:
        return 'Josephine Baker'
    if 'mon amour' in t or re.search(r', my love|-my-love', t, re.I):
        return "Les amours (Mon amour)"
    if 'traditions iconiques' in t:
        return 'Traditions iconiques'
    if title.startswith('Paris'):
        return 'Paris, ville lumière'
    if num and num >= 79:
        return 'Best of (Revisited)'
    return 'Histoires (Stories)'

# 1) episode slug list
slugs = []
page = 1
while True:
    url = 'https://podcast.duolingo.com/french' + ('.html' if page == 1 else f'{page}.html')
    try:
        txt = get(url)
    except Exception as e:
        break
    found = re.findall(r'\./episode-([0-9]+-[\w-]+)', txt)
    if not found:
        break
    slugs += found
    if len(found) < 5:
        break
    page += 1
    if page > 30:
        break
    time.sleep(0.2)
slugs = sorted(set(slugs), key=lambda s: int(s.split('-')[0]))
print('episodes found:', len(slugs))
if len(sys.argv) > 1:
    slugs = slugs[:int(sys.argv[1])]

generated = skipped = 0
for slug in slugs:
    url = f'https://podcast.duolingo.com/episode-{slug}'
    path = os.path.join(OUT, f'episode-{slug}.md')
    if os.path.exists(path):
        continue
    try:
        txt = get(url)
    except Exception as e:
        skipped += 1
        continue
    mt = re.search(r'<title>(.*?)</title>', txt, re.S)
    title = clean(mt.group(1)) if mt else slug
    title = re.sub(r'\s*[-–]\s*Duolingo\s*$', '', title)
    num = re.match(r'Episode\s*(\d+)', title)
    number = num.group(1) if num else str(slug.split('-')[0])
    tidy = title
    if num:
        tidy = title.replace(f'Episode {number}: ', '')
    meta = re.search(r'<meta\s+name="description"\s+content="([^"]+)"', txt)
    desc = clean(html.unescape(meta.group(1))) if meta else ''
    audio_embed = ''
    ifm = re.search(r'<iframe[^>]*src="(//html5-player\.libsyn\.com[^"]+|https://html5-player\.libsyn\.com[^"]+)"', txt)
    if not ifm:
        ifm = re.search(r'src="(//html5-player\.libsyn\.com[^"]+)"', txt)
    if ifm:
        audio_embed = ('https:' + ifm.group(1)) if ifm.group(1).startswith('//') else ifm.group(1)
    # French-only transcript: keep only storyteller (French) paragraphs in order
    french_lines = []
    tr = re.search(r'>\s*Transcript\s*</h2>(.*?)(<h2|$)', txt, re.S)
    if tr:
        paras = re.findall(r'<p>\s*(?:<strong[^>]*>[^<]+</strong>\s*:\s*)?(.*?)</p>', tr.group(1), re.S)
        for body in paras:
            text = clean(re.sub(r'<[^>]+>', ' ', body))
            text = re.sub(r'^[A-Za-zÀ-ÿ]+\s*:\s*', '', text).strip()
            if not text or french_ratio(text) < 0.25:
                continue
            french_lines.append(text)
    lines = [
        '---',
        f'title: "{clean(tidy).replace(chr(34), "")}"',
        f'slug: "episode-{slug}"',
        'type: "podcast"',
        'level: "A2–B1"',
        'emoji: "🎙️"',
        f'description: "{clean(desc)[:220].replace(chr(34), "")}"',
        'author: "Duolingo French Podcast"',
        'duration: "intermediate"',
        f'order: {number}',
        f'series: "{series_of(int(number) if number.isdigit() else 0, tidy)}"',
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
        f'{clean(desc)}',
        '',
        'Listen first without reading, then follow along with the French below. The narrator speaks',
        'English for context, but the storyteller lines below are the French to read aloud.',
        f'(_This is a French-only transcript. Duolingo shows its narrator English as context, not as a',
        f'line-by-line translation — add a curated translation by editing the `# Transcript` table_,',
        'like the original lesson _Episode 88: Une chanson révolutionnaire_.)',
        ''
    ]
    if french_lines:
        lines += ['# Transcript', '', '| French | English | Notes |', '|---|---|---|']
        for fr in french_lines:
            lines.append(f'| {fr.replace("|", "\\\\|")} |  |  |')
        lines.append('')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines))
    generated += 1
    print('ok', number, tidy[:45])

print(f'\nDONE generated={generated} skipped={skipped}')