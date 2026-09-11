"""Maison Tarot writer — local web UI. Run: python app.py  → http://localhost:8765"""
import threading, queue, webbrowser, json, os, sys, collections
from flask import Flask, jsonify, request, send_from_directory, Response
import writer, images

app = Flask(__name__, static_folder=None)
LOG = collections.deque(maxlen=400); JOBS = queue.Queue(); BUSY = {'n': 0}
def log(m): LOG.append(m); print(m, flush=True)

def worker():
    while True:
        job = JOBS.get()
        BUSY['n'] += 1
        try:
            if job['kind'] == 'prepare': writer.run_prepare(log)
            elif job['kind'] == 'export': writer.export_image_prompts(log)
            elif job['kind'] == 'cover': images.generate_cover(job['id'], force=job['force'], log=log)
            else: writer.run_one(job['id'], do_en=job['en'], do_fr=job['fr'], force=job['force'], log=log)
        except Exception as e: log(f"ERROR {job}: {e}")
        BUSY['n'] -= 1; JOBS.task_done()
for _ in range(int(os.environ.get('MT_WORKERS', '2'))): threading.Thread(target=worker, daemon=True).start()

HTML = r"""<!doctype html><html><head><meta charset="utf-8"><title>Maison Tarot — writer</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=DM+Mono&display=swap" rel="stylesheet">
<style>
body{margin:0;font:14px/1.5 Inter,system-ui,sans-serif;color:#0a0a0a;background:#fff}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #e2e2e2;padding:.8rem 1.2rem;display:flex;gap:.8rem;align-items:center;flex-wrap:wrap;z-index:2}
header b{letter-spacing:.14em;font-weight:500;margin-right:1rem}
button,select,input[type=search]{font:inherit;border:1px solid #0a0a0a;background:#fff;border-radius:999px;padding:.35em .9em;cursor:pointer}
button.solid{background:#0a0a0a;color:#fff}button.gold{border-color:#a88c52;color:#a88c52}
main{display:grid;grid-template-columns:1fr 20rem;gap:0;height:calc(100vh - 3.6rem)}
.tbl{overflow:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.45rem .6rem;border-bottom:1px solid #eee;vertical-align:top}th{position:sticky;top:0;background:#f7f7f7;font:11px 'DM Mono',monospace;letter-spacing:.04em;color:#666}
td.n{font:11px 'DM Mono',monospace;color:#666;white-space:nowrap}.t{font-weight:500}.t small{display:block;color:#666;font-weight:400}
textarea{width:100%;min-height:2.4em;font:12px Inter,sans-serif;border:1px solid #e2e2e2;border-radius:6px;padding:.3em .5em;resize:vertical}
.s{font:11px 'DM Mono',monospace;white-space:nowrap}.s.written{color:#2e8b57}.s.todo{color:#999}.s.check{color:#c0392b}.s.exists{color:#a88c52}
aside{border-left:1px solid #e2e2e2;padding:1rem;font:12px 'DM Mono',monospace;overflow:auto;background:#fafafa}aside div{margin-bottom:.4em;white-space:pre-wrap}
.pill{font:11px 'DM Mono',monospace;border:1px solid #e2e2e2;border-radius:999px;padding:.1em .6em;color:#666}
</style></head><body>
<header><b>MAISON TAROT · WRITER</b>
<input type="search" id="q" placeholder="search titles…" oninput="render()">
<select id="cat" onchange="render()"><option value="">all categories</option></select>
<select id="st" onchange="render()"><option value="">any status</option><option value="todo">to write</option><option value="written">written</option><option value="check">needs check</option></select>
<span class="pill" id="count"></span>
<span style="flex:1"></span>
<button onclick="selAll(true)">select all shown</button><button onclick="selAll(false)">none</button>
<select id="prov" onchange="models()"></select><input id="model" list="modelList" style="font:inherit;border:1px solid #0a0a0a;border-radius:999px;padding:.35em .9em;width:14rem" onchange="setModel()"><datalist id="modelList"></datalist>
<button class="gold" onclick="prepare()">Prepare titles</button><button class="gold" onclick="fetch('/api/export-images',{method:'POST'})">Export image prompts</button>
<button onclick="gen(true,false)">Generate EN</button><button onclick="gen(false,true)">Generate FR</button><button class="solid" onclick="gen(true,true)">Generate both</button>
<button onclick="gen(true,true,true)">Regenerate (force)</button>
<button class="gold" onclick="covers(false)">Generate covers</button><button onclick="covers(true)">Redo covers</button>
<span class="pill" id="busy"></span></header>
<main><div class="tbl"><table><thead><tr><th></th><th>id</th><th>title</th><th>category</th><th>len</th><th>EN</th><th>FR</th><th>cover</th><th style="min-width:18rem">notes for the writer</th></tr></thead><tbody id="rows"></tbody></table></div>
<aside id="log"></aside></main>
<script>
let ROWS=[];const sel=new Set();
async function load(){ROWS=await (await fetch('/api/plan')).json();const cats=[...new Set(ROWS.map(r=>r.category))].sort();const c=document.getElementById('cat');cats.forEach(x=>{const o=document.createElement('option');o.value=x;o.textContent=x;c.appendChild(o)});render()}
function cls(s){return s.startsWith('written (')?'check':s.startsWith('written')?'written':s==='exists'?'exists':'todo'}
function shown(){const q=document.getElementById('q').value.toLowerCase(),cat=document.getElementById('cat').value,st=document.getElementById('st').value;return ROWS.filter(r=>(r.type==='article'||r.type==='pillar')&&r.status_en!=='merged'&&(!cat||r.category===cat)&&(!q||(r.title_en+' '+r.title_fr).toLowerCase().includes(q))&&(!st||(st==='check'?(cls(r.status_en)==='check'||cls(r.status_fr)==='check'):st==='written'?(cls(r.status_en)==='written'&&cls(r.status_fr)==='written'):(cls(r.status_en)==='todo'||cls(r.status_fr)==='todo'))))}
function render(){const rows=shown();document.getElementById('count').textContent=rows.length+' articles · '+sel.size+' selected';document.getElementById('rows').innerHTML=rows.map(r=>`<tr><td><input type=checkbox ${sel.has(r.id)?'checked':''} onchange="tog('${r.id}',this.checked)"></td><td class=n>${r.id}<br>${r.origin}</td><td class=t>${r.title_en||'<i>(EN to prepare)</i>'}<small>${r.title_fr||'<i>(FR to prepare)</i>'}</small><small>/blog/${r.slug_en||'?'}/ · /fr/blog/${r.slug_fr||'?'}/</small></td><td>${r.category}</td><td class=n>${r.length}</td><td class="s ${cls(r.status_en)}" title="${r.status_en}">${r.status_en.split(' ')[0]}${cls(r.status_en)==='check'?' ⚠':''}</td><td class="s ${cls(r.status_fr)}" title="${r.status_fr}">${r.status_fr.split(' ')[0]}${cls(r.status_fr)==='check'?' ⚠':''}</td><td class="s ${r.cover==='done'?'written':'todo'}">${r.cover||'—'}</td><td><textarea onchange="note('${r.id}',this.value)" placeholder="${(r.angle||'').replace(/"/g,'&quot;')}">${r.notes||''}</textarea></td></tr>`).join('')}
function tog(id,on){on?sel.add(id):sel.delete(id);document.getElementById('count').textContent=shown().length+' articles · '+sel.size+' selected'}
function selAll(on){shown().forEach(r=>on?sel.add(r.id):sel.delete(r.id));render()}
async function note(id,v){await fetch('/api/note',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,notes:v})});const r=ROWS.find(x=>x.id===id);if(r)r.notes=v}
async function gen(en,fr,force=false){if(!sel.size)return alert('Select at least one article.');await fetch('/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:[...sel],en,fr,force})})}
async function covers(force){if(!sel.size)return alert('Select at least one article.');await fetch('/api/covers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:[...sel],force})})}
async function prepare(){await fetch('/api/prepare',{method:'POST'})}
async function poll(){const s=await (await fetch('/api/status')).json();document.getElementById('log').innerHTML=s.log.slice().reverse().map(l=>'<div>'+l.replace(/</g,'&lt;')+'</div>').join('');document.getElementById('busy').textContent=s.busy?('working… '+s.busy+' job(s), '+s.queued+' queued'):'idle';if(s.changed){ROWS=await (await fetch('/api/plan')).json();render()}}
let PROV={};async function loadSettings(){const s=await (await fetch('/api/settings')).json();PROV=s.providers;const p=document.getElementById('prov');p.innerHTML=Object.keys(PROV).map(k=>`<option ${k===s.provider?'selected':''}>${k}</option>`).join('');models(s.model)}
function models(keep){const prov=document.getElementById('prov').value;document.getElementById('modelList').innerHTML=(PROV[prov]||[]).map(m=>`<option value="${m}">`).join('');const inp=document.getElementById('model');inp.value=keep||(PROV[prov]||[''])[0];setModel()}
async function setModel(){await fetch('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:document.getElementById('prov').value,model:document.getElementById('model').value})})}
load();loadSettings();setInterval(poll,2500);
</script></body></html>"""

LAST = {'mtime': 0}
@app.route('/')
def index(): return Response(HTML, mimetype='text/html')
@app.route('/api/plan')
def plan(): LAST['mtime'] = os.path.getmtime(writer.PLAN); return jsonify(writer.read_plan())
@app.route('/api/note', methods=['POST'])
def note():
    d = request.json; rows = writer.read_plan(); r = writer.row_by_id(rows, d['id'])
    if r: r['notes'] = d['notes']; writer.write_plan(rows)
    return jsonify(ok=True)
@app.route('/api/generate', methods=['POST'])
def generate():
    d = request.json
    for rid in d['ids']: JOBS.put({'kind': 'one', 'id': rid, 'en': d['en'], 'fr': d['fr'], 'force': d.get('force', False)})
    log(f"queued {len(d['ids'])} article(s)"); return jsonify(ok=True)
@app.route('/api/settings', methods=['GET', 'POST'])
def settings():
    if request.method == 'POST':
        d = request.json; writer.SETTINGS['provider'] = d['provider']; writer.SETTINGS['model'] = d['model']; log(f"model: {d['provider']} / {d['model']}")
    return jsonify(providers=writer.PROVIDERS, **writer.SETTINGS)
@app.route('/api/export-images', methods=['POST'])
def export_images(): JOBS.put({'kind': 'export'}); return jsonify(ok=True)
@app.route('/api/covers', methods=['POST'])
def covers():
    d = request.json
    for rid in d['ids']: JOBS.put({'kind': 'cover', 'id': rid, 'force': d.get('force', False)})
    log(f"queued {len(d['ids'])} cover(s) — provider {images.IMG['provider']}"); return jsonify(ok=True)
@app.route('/api/prepare', methods=['POST'])
def prepare(): JOBS.put({'kind': 'prepare'}); return jsonify(ok=True)
@app.route('/api/status')
def status():
    m = os.path.getmtime(writer.PLAN); changed = m != LAST['mtime']
    return jsonify(log=list(LOG), busy=BUSY['n'], queued=JOBS.qsize(), changed=changed)

if __name__ == '__main__':
    if not any(os.environ.get(k) for k in ('ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY')) and not writer.DRY: print('Set an API key first: ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY (or MT_DRY_RUN=1 to test without).')
    threading.Timer(1.0, lambda: webbrowser.open('http://localhost:8765')).start()
    app.run(port=8765, debug=False)
