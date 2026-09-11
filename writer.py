"""Maison Tarot article writer — prompt building, API calls, validation, file output."""
import os, re, csv, json, hashlib, time, datetime, unicodedata, pathlib
import yaml

# .env: KEY=value lines next to this file (API keys, MT_MODEL…), so nothing has to be typed each time
_env = pathlib.Path(__file__).parent/'.env'
if _env.exists():
    for _l in _env.read_text(encoding='utf-8').splitlines():
        if '=' in _l and not _l.strip().startswith('#'):
            _k, _v = _l.split('=', 1); os.environ.setdefault(_k.strip(), _v.strip().strip('"'))

ROOT = pathlib.Path(__file__).parent
DATA, PROMPTS, NOTES, OUT = ROOT/'data', ROOT/'prompts', ROOT/'notes', ROOT/'out'
PLAN = DATA/'plan.csv'
DRY = os.environ.get('MT_DRY_RUN') == '1'
PROVIDERS = {
  'anthropic': ['claude-fable-5-1', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  'openai':    ['gpt-5.6-sol', 'gpt-5.6-mini', 'gpt-5.5'],
  'google':    ['gemini-3-pro', 'gemini-3-flash'],
}
SETTINGS = {'provider': os.environ.get('MT_PROVIDER', 'anthropic'), 'model': os.environ.get('MT_MODEL', 'claude-fable-5-1')}
CAT_FR = {'Learn': 'Apprendre', 'Practice': 'Tirages', 'Ideas we refuse': 'Idées reçues', 'Trends': 'Tendances', 'Astrology, tested': 'Astrologie testée', 'Lenses & adjacent': 'Clés de lecture', 'Seasonal': 'Saisonnier', 'For readers': 'Pour les tarologues', 'Card meanings': 'Signification des lames', 'Stories & experience': 'Récits', 'Method': 'Méthode', 'Local': 'Villes'}

BANNED = [r'\bmanifest(ing|ation)?\b(?! culture)', r'\bvibes?\b', r'\bdivine\b', r'\bsacred\b', r'\bblessed\b', r'\bvoyance\b(?!.*(arnaque|scam))']

# ——— plan I/O ———
def read_plan():
    with open(PLAN, encoding='utf-8') as f: return list(csv.DictReader(f))
def write_plan(rows):
    cols = list(rows[0].keys())
    tmp = PLAN.with_suffix('.tmp')
    with open(tmp, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader(); w.writerows(rows)
    tmp.replace(PLAN)
def row_by_id(rows, rid):
    for r in rows:
        if r['id'] == rid: return r
    return None

# ——— allowed paths for links ———
def site_paths():
    sp = json.load(open(DATA/'site_paths.json'))
    rows = read_plan()
    en = set(sp['paths']) | {r['path_en'] for r in rows if r['path_en']}
    fr = set(sp['paths']) | {r['path_fr'] for r in rows if r['path_fr']}
    en2fr = dict(sp['en2fr']); fr2en = dict(sp['fr2en'])
    for r in rows:
        if r['path_en'] and r['path_fr']: en2fr[r['path_en']] = r['path_fr']; fr2en[r['path_fr']] = r['path_en']
    return {'en': {p for p in en if not p.startswith('/fr/')}, 'fr': {p for p in fr if p.startswith('/fr/')}, 'en2fr': en2fr, 'fr2en': fr2en}

def path_list_text(lang, paths, rows):
    """Compact list of allowed link targets with a hint of what each is."""
    titles = {}
    for r in rows:
        if r['path_en']: titles[r['path_en']] = r['title_en'] or r['title_fr']
        if r['path_fr']: titles[r['path_fr']] = r['title_fr'] or r['title_en']
    ps = sorted(paths)
    return "\n".join(f"{p} — {titles.get(p, '')[:70]}" if titles.get(p) else p for p in ps)

# ——— API ———
def client():
    import anthropic
    return anthropic.Anthropic()

def call(system_blocks, user, max_tokens=6000):
    if DRY:
        return "---\ntitle: DRY RUN\n---\n(dry run — no API call)\n"
    prov, model = SETTINGS['provider'], SETTINGS['model']
    sys_text = "\n\n".join(b['text'] for b in system_blocks)
    if prov == 'anthropic':
        msg = client().messages.create(model=model, max_tokens=max_tokens, system=system_blocks, messages=[{'role': 'user', 'content': user}])
        return "".join(b.text for b in msg.content if getattr(b, 'type', '') == 'text')
    if prov == 'openai':
        from openai import OpenAI
        r = OpenAI().chat.completions.create(model=model, messages=[{'role': 'system', 'content': sys_text}, {'role': 'user', 'content': user}], max_completion_tokens=max_tokens)
        return r.choices[0].message.content
    if prov == 'google':
        from google import genai
        r = genai.Client().models.generate_content(model=model, contents=user, config={'system_instruction': sys_text, 'max_output_tokens': max_tokens})
        return r.text
    raise ValueError('unknown provider ' + prov)

def cached(text):
    return {'type': 'text', 'text': text, 'cache_control': {'type': 'ephemeral'}}

# ——— prompt assembly ———
def base_context(lang):
    style = (PROMPTS/'style.md').read_text(encoding='utf-8')
    facts = (NOTES/'facts.md').read_text(encoding='utf-8')
    brand = (NOTES/'brand-book.md').read_text(encoding='utf-8') if (NOTES/'brand-book.md').exists() else ''
    exs = sorted(NOTES.glob(f'example_{lang}_*.md'))
    examples = "\n\n".join(f"<example>\n{p.read_text(encoding='utf-8')}\n</example>" for p in exs)
    img = (PROMPTS/'image_style.md').read_text(encoding='utf-8') if (PROMPTS/'image_style.md').exists() else ''
    return f"<style_guide>\n{style}\n</style_guide>\n\n<facts>\n{facts}\n</facts>\n\n<brand_book>\n{brand[:30000]}\n</brand_book>\n\n<image_style>\n{img}\n</image_style>\n\n<examples>\n{examples}\n</examples>"

def generate_en(row, rows, paths):
    sys_ = (PROMPTS/'system_en.md').read_text(encoding='utf-8')
    system = [cached(sys_ + "\n\n" + base_context('en')), cached("<allowed_paths>\n" + path_list_text('en', paths['en'], rows) + "\n</allowed_paths>")]
    today = datetime.date.today().isoformat()
    user = f"""Write this article.

id: {row['id']}
title (use it as the front-matter title, you may tighten it slightly): {row['title_en']}
target keyword: {row['keyword_en']}
category: {row['category']}
suggested tags: {row['tags']}
length (body words): {row['length'] or 900}
slug: {row['slug_en']}  (front matter must include: translationKey: post-{row['slug_en']})
house angle: {row['angle']}
host's notes (highest priority — follow them): {row['notes'] or '(none)'}
date: {today}

Set `image: "covers/{row['slug_en']}.jpg"` in the front matter. Also add to the front matter a field `imagePrompt:` — one image-generation prompt for this article's cover, following <image_style> exactly (subject specific to this article, then the fixed style suffix, then the negative list).

Reminder: link only to paths in <allowed_paths>; never invent personal facts beyond <facts>; the '300 readings' count only if it is the subject."""
    return call(system, user)

def generate_fr(row, rows, paths, en_text):
    sys_ = (PROMPTS/'system_fr.md').read_text(encoding='utf-8')
    system = [cached(sys_ + "\n\n" + base_context('fr')), cached("<allowed_paths>\n" + path_list_text('fr', paths['fr'], rows) + "\n</allowed_paths>")]
    # link map for this article
    links = re.findall(r'\]\((/[^)#]*)(#[^)]*)?\)', en_text)
    mapping = []
    for p, anchor in links:
        f = paths['en2fr'].get(p)
        if f: mapping.append(f"{p}{anchor or ''} -> {f}{anchor or ''}")
        else: mapping.append(f"{p}{anchor or ''} -> (no French page; drop the link, keep the sentence)")
    today = datetime.date.today().isoformat()
    user = f"""Écrivez la version française de cet article.

id : {row['id']}
titre français (à utiliser comme title, vous pouvez le resserrer) : {row['title_fr'] or '(proposez-le, mot-clé en tête)'}
mot-clé cible : {row['keyword_fr'] or '(déduisez-le)'}
catégorie (à écrire exactement ainsi dans categories) : {CAT_FR.get(row['category'], row['category'])}
tags : en français, 5 à 7, pas une traduction mot à mot des tags anglais
longueur (mots du corps) : {row['length'] or 900}
imagePrompt : recopiez tel quel le champ imagePrompt de l'article anglais (même image de couverture pour les deux langues) ; et `image: "covers/{row['slug_en']}.jpg"`
slug : {row['slug_fr']}  (le front matter doit contenir : translationKey: post-{row['slug_en']})
notes de l'hôte (priorité absolue) : {row['notes'] or '(aucune)'}
date : {today}

Correspondance des liens (anglais -> français) :
{chr(10).join(mapping) or '(aucun lien)'}

<article_anglais>
{en_text}
</article_anglais>"""
    return call(system, user)

def prepare_titles(rows_missing):
    """One call per ~40 rows: propose the missing language's title/keyword/slug."""
    prompt = (PROMPTS/'prepare_titles.md').read_text(encoding='utf-8')
    out = {}
    for i in range(0, len(rows_missing), 40):
        chunk = rows_missing[i:i+40]
        lines = []
        for r in chunk:
            if r['origin'] == 'en': lines.append(f"id={r['id']} | need: FRENCH | english title: {r['title_en']} | keyword: {r['keyword_en']} | category: {r['category']}")
            else: lines.append(f"id={r['id']} | need: ENGLISH | french title: {r['title_fr']} | keyword: {r['keyword_fr']} | category: {r['category']}")
        text = call([{'type': 'text', 'text': prompt}], "\n".join(lines), max_tokens=8000)
        if DRY: return out
        m = re.search(r'\[.*\]', text, re.S)
        for item in json.loads(m.group(0)):
            out[str(item['id'])] = item
    return out

# ——— validation ———
def split_fm(text):
    m = re.match(r'^\s*---\n(.*?)\n---\n(.*)$', text, re.S)
    if not m: return None, text
    try: return yaml.safe_load(m.group(1)), m.group(2)
    except Exception: return None, text

def validate(text, row, lang, paths):
    problems = []
    fm, body = split_fm(text)
    if not fm: return ['no front matter']
    for k in ['title', 'description', 'translationKey', 'type', 'date', 'categories', 'tags', 'summary', 'image', 'imageAlt', 'imagePrompt']:
        if k not in fm: problems.append(f'missing front matter: {k}')
    if fm.get('translationKey') != f"post-{row['slug_en']}": problems.append('translationKey mismatch')
    d = str(fm.get('description', ''))
    if not (110 <= len(d) <= 175): problems.append(f'description length {len(d)}')
    words = len(re.findall(r"\w+", body))
    target = int(row['length'] or 900)
    if words < target * 0.75 or words > target * 1.35: problems.append(f'length {words} vs {target}')
    allowed = paths['en'] if lang == 'en' else paths['fr']
    for p, anchor in re.findall(r'\]\((/[^)#\s]*)(#[^)]*)?\)', body):
        if p not in allowed: problems.append(f'link not allowed: {p}')
    if lang == 'en' and not (row['keyword_en'].lower().startswith('is tarot real') or '300' in (row['title_en'] or '')):
        if re.search(r'\b300\b', body): problems.append("'300' mentioned outside its subject")
    for pat in BANNED:
        if re.search(pat, body, re.I): problems.append(f'banned pattern: {pat}')
    if 'lentille' in body.lower() and lang == 'fr': problems.append("'lentille' used")
    if re.search(r'\bthe House\b', body) : problems.append("'the House' used — say Maison Tarot")
    if re.search(r'\bthe host\b', body, re.I) and lang == 'en': problems.append("'the host' used — say I")
    return problems

def strip_fences(text):
    text = text.strip()
    text = re.sub(r'^```(?:markdown|md)?\n', '', text); text = re.sub(r'\n```$', '', text)
    return text

# ——— run one ———
def run_one(rid, do_en=True, do_fr=True, force=False, log=print):
    rows = read_plan(); row = row_by_id(rows, rid)
    if not row: return log(f'{rid}: not in plan')
    if row['type'] not in ('article', 'pillar'): return log(f"{rid}: type {row['type']} — this tool writes blog articles only")
    if row['status_en'] == 'merged': return log(f'{rid}: merged, skipped')
    paths = site_paths()
    en_path = OUT/'content'/'en'/'blog'/f"{row['slug_en']}.md"
    fr_path = OUT/'content'/'fr'/'blog'/f"{row['slug_fr']}.md"
    en_path.parent.mkdir(parents=True, exist_ok=True); fr_path.parent.mkdir(parents=True, exist_ok=True)
    state = load_state()
    if do_en:
        if en_path.exists() and not force and state.get(str(en_path)) != sha(en_path.read_text(encoding='utf-8')):
            log(f'{rid}: EN file was edited by hand — skipped (use force)')
        else:
            log(f'{rid}: writing EN…')
            text = strip_fences(generate_en(row, rows, paths))
            probs = validate(text, row, 'en', paths)
            if probs and not DRY:
                log(f'{rid}: EN retry — ' + '; '.join(probs))
                text = strip_fences(generate_en({**row, 'notes': (row['notes'] + ' | FIX THESE: ' + '; '.join(probs))}, rows, paths))
                probs = validate(text, row, 'en', paths)
            en_path.write_text(text, encoding='utf-8'); state[str(en_path)] = sha(text)
            row['status_en'] = 'written' if not probs else 'written (check: ' + '; '.join(probs)[:200] + ')'
            write_plan(rows); save_state(state); log(f'{rid}: EN done ({len(text.split())} words)' + (' — WARNINGS: ' + '; '.join(probs) if probs else ''))
    if do_fr:
        site_en = pathlib.Path(os.environ.get('MT_SITE', str(ROOT.parent/'mt')))/'content'/'en'/'blog'/f"{row['slug_en']}.md"
        if not en_path.exists() and site_en.exists(): en_path = site_en  # already on the site (written earlier)
        if not en_path.exists(): return log(f'{rid}: no EN file to adapt from (looked in out/ and in the site)')
        if not row['slug_fr']: return log(f'{rid}: no French slug — run Prepare first')
        if fr_path.exists() and not force and state.get(str(fr_path)) != sha(fr_path.read_text(encoding='utf-8')):
            log(f'{rid}: FR file was edited by hand — skipped (use force)')
        else:
            log(f'{rid}: writing FR…')
            text = strip_fences(generate_fr(row, rows, paths, en_path.read_text(encoding='utf-8')))
            probs = validate(text, row, 'fr', paths)
            if probs and not DRY:
                log(f'{rid}: FR retry — ' + '; '.join(probs))
                text = strip_fences(generate_fr({**row, 'notes': (row['notes'] + ' | À CORRIGER : ' + '; '.join(probs))}, rows, paths, en_path.read_text(encoding='utf-8')))
                probs = validate(text, row, 'fr', paths)
            fr_path.write_text(text, encoding='utf-8'); state[str(fr_path)] = sha(text)
            row['status_fr'] = 'written' if not probs else 'written (check: ' + '; '.join(probs)[:200] + ')'
            write_plan(rows); save_state(state); log(f'{rid}: FR done ({len(text.split())} words)' + (' — WARNINGS: ' + '; '.join(probs) if probs else ''))

def sha(t): return hashlib.sha256(t.encode('utf-8')).hexdigest()
def load_state():
    p = DATA/'state.json'; return json.load(open(p)) if p.exists() else {}
def save_state(s): json.dump(s, open(DATA/'state.json', 'w'), indent=1)

def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower(); s = re.sub(r"['’]", "", s); return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

def run_prepare(log=print):
    rows = read_plan()
    missing = [r for r in rows if r['type'] in ('article', 'pillar') and r['status_en'] != 'merged' and ((r['origin'] == 'en' and not r['title_fr']) or (r['origin'] == 'fr' and not r['title_en']))]
    log(f'preparing {len(missing)} counterparts…')
    got = prepare_titles(missing)
    used = {r['path_en'] for r in rows} | {r['path_fr'] for r in rows}
    for r in missing:
        it = got.get(r['id']); 
        if not it: continue
        s = slugify(it['slug'])[:70]
        if r['origin'] == 'en':
            p = '/fr/blog/' + s + '/'
            while p in used: s += '-2'; p = '/fr/blog/' + s + '/'
            r['title_fr'], r['keyword_fr'], r['slug_fr'], r['path_fr'] = it['title'], it['keyword'], s, p
        else:
            p = '/blog/' + s + '/'
            while p in used: s += '-2'; p = '/blog/' + s + '/'
            r['title_en'], r['keyword_en'], r['slug_en'], r['path_en'] = it['title'], it['keyword'], s, p
        used.add(p)
    write_plan(rows); log(f'prepared {len(got)} rows')

def export_image_prompts(log=print):
    rows = read_plan(); out = []
    for r in rows:
        for lang, folder in (('en', 'en'),):
            p = OUT/'content'/lang/'blog'/f"{r['slug_en']}.md"
            if not p.exists(): p = pathlib.Path(os.environ.get('MT_SITE', str(ROOT.parent/'mt')))/'content'/lang/'blog'/f"{r['slug_en']}.md"
            if p.exists():
                fm, _ = split_fm(p.read_text(encoding='utf-8'))
                if fm and fm.get('imagePrompt'): out.append(dict(id=r['id'], slug=r['slug_en'], file='cover.jpg', folder_en=f"content/en/blog/{r['slug_en']}/", folder_fr=f"content/fr/blog/{r['slug_fr']}/", prompt=fm['imagePrompt'], alt=fm.get('imageAlt', '')))
    with open(DATA/'image_prompts.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['id', 'slug', 'file', 'folder_en', 'folder_fr', 'prompt', 'alt']); w.writeheader(); w.writerows(out)
    log(f'exported {len(out)} image prompts to data/image_prompts.csv')

if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument('ids', nargs='*'); ap.add_argument('--prepare', action='store_true'); ap.add_argument('--en-only', action='store_true'); ap.add_argument('--fr-only', action='store_true'); ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    if a.prepare: run_prepare()
    for rid in a.ids: run_one(rid, do_en=not a.fr_only, do_fr=not a.en_only, force=a.force)
