"""Cover generation: imagePrompt (front matter) → out/assets/covers/<slug>.jpg (1600×1200)."""
import os, io, re, base64, pathlib
from PIL import Image
import writer

ROOT = writer.ROOT
IMG = {'provider': os.environ.get('MT_IMAGE_PROVIDER', 'google'), 'model': os.environ.get('MT_IMAGE_MODEL', '')}
DEFAULTS = {'google': 'gemini-2.5-flash-image', 'openai': 'gpt-image-1'}
REF = ROOT/'notes'/'reference.jpg'

def _google(prompt):
    from google import genai
    from google.genai import types
    client = genai.Client()
    model = IMG['model'] or DEFAULTS['google']
    parts = []
    if REF.exists():
        parts.append(types.Part.from_bytes(data=REF.read_bytes(), mime_type='image/jpeg'))
        prompt = "Match the photographic style, lighting and tonality of the attached reference photo exactly. " + prompt
    parts.append(prompt)
    r = client.models.generate_content(model=model, contents=parts, config=types.GenerateContentConfig(response_modalities=['IMAGE', 'TEXT']))
    for cand in r.candidates:
        for p in cand.content.parts:
            if getattr(p, 'inline_data', None) and p.inline_data.data:
                return p.inline_data.data
    raise RuntimeError('no image in response')

def _openai(prompt):
    from openai import OpenAI
    r = OpenAI().images.generate(model=IMG['model'] or DEFAULTS['openai'], prompt=prompt, size='1536x1024', quality='medium', n=1)
    return base64.b64decode(r.data[0].b64_json)

def generate_cover(rid, force=False, log=print):
    rows = writer.read_plan(); row = writer.row_by_id(rows, rid)
    if not row or not row['slug_en']: return log(f'{rid}: no English slug')
    out = ROOT/'out'/'assets'/'covers'/f"{row['slug_en']}.jpg"; out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and not force: return log(f'{rid}: cover exists — skipped (force to redo)')
    # find the prompt in the EN file (out/ first, then the site)
    p = ROOT/'out'/'content'/'en'/'blog'/f"{row['slug_en']}.md"
    if not p.exists(): p = pathlib.Path(os.environ.get('MT_SITE', str(ROOT.parent/'mt')))/'content'/'en'/'blog'/f"{row['slug_en']}.md"
    if not p.exists(): return log(f'{rid}: no English article to take the prompt from')
    fm, _ = writer.split_fm(p.read_text(encoding='utf-8'))
    prompt = (fm or {}).get('imagePrompt')
    if not prompt: return log(f'{rid}: the article has no imagePrompt (regenerate it, or add one to the front matter)')
    if writer.DRY: return log(f'{rid}: (dry run) would generate: {prompt[:80]}…')
    log(f'{rid}: generating cover ({IMG["provider"]})…')
    data = _google(prompt) if IMG['provider'] == 'google' else _openai(prompt)
    im = Image.open(io.BytesIO(data)).convert('RGB')
    # crop to 4:3 then resize
    w, h = im.size; tw = w; th = int(w * 3 / 4)
    if th > h: th = h; tw = int(h * 4 / 3)
    im = im.crop(((w - tw)//2, (h - th)//2, (w - tw)//2 + tw, (h - th)//2 + th)).resize((1600, 1200), Image.LANCZOS)
    im.save(out, 'JPEG', quality=86, optimize=True)
    # point both language files at it
    for lang, slug in (('en', row['slug_en']), ('fr', row['slug_fr'])):
        f = ROOT/'out'/'content'/lang/'blog'/f"{slug}.md"
        if slug and f.exists():
            t = f.read_text(encoding='utf-8'); t2 = re.sub(r'^image:.*$', f'image: "covers/{row["slug_en"]}.jpg"', t, count=1, flags=re.M)
            if t2 != t: f.write_text(t2, encoding='utf-8'); st = writer.load_state(); st[str(f)] = writer.sha(t2); writer.save_state(st)
    row['cover'] = 'done'; writer.write_plan(rows); log(f'{rid}: cover saved → assets/covers/{row["slug_en"]}.jpg')
