# Maison Tarot — writer (web)

The writer, on the internet: write articles in English and French from your phone, read them, correct them, generate the covers, and publish straight to the site repository. Supabase holds everything; Vercel runs it; GitHub receives the finished files and rebuilds the site.

---

## What it does

- **Plan** — the 727 rows, searchable, filterable, with your notes. Notes are saved as you type and outrank every other instruction.
- **Write** — one article or fifty: English, French, or both. The French is an adaptation, not a translation, with the links swapped to their French equivalents and the same `translationKey` so the site pairs them.
- **Batch EN ½ / Batch FR ½** — the same work at half price through the Anthropic Batch API, for when you select a hundred at once — or three hundred. English first; once it's in, select the same rows and Batch FR. Results arrive on their own; the app collects them when you open it, and every ten minutes if you've set the Supabase cron.
- **Cost** — every call is recorded with its tokens and price; the header shows today and total, each article shows what it cost so far. Prices live in the `docs` table, row `prices`; edit them when they change.
- **Read and edit** — tap a title to read the article, switch language, edit, save. An edited article is never overwritten by a regeneration unless you ask.
- **Covers** — an image per article pair, from the prompt the writer put in the front matter, in the house style.
- **Publish** — commits the two Markdown files and the cover into the Hugo repository. GitHub Actions rebuilds the site.

---

## Setting it up

### 1. Supabase
Open your project → SQL editor → paste `supabase/schema.sql` → run. Then `supabase/usage.sql` (cost tracking and the price table), then `supabase/overnight.sql` (chained batches and the cover queue). Then Project settings → API, and copy the **project URL** and the **service_role** key.

### 2. Local, once: fill the database
From this folder, with the local writer folder and the site next to it:

```powershell
npm install
$env:NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
node scripts/import-plan.mjs ..\mt-writer ..\mt
```

That loads the plan, the style guide, the brand book, the facts, the examples, the site path map, and every article already on the site.

### 3. GitHub token
github.com → Settings → Developer settings → **Fine-grained tokens** → new token, repository access limited to `maison-tarot`, permission **Contents: read and write**. Copy it.

### 4. Vercel
Import this repository. Add the environment variables from `.env.example` — Supabase URL and service key, `APP_PASSWORD` (choose a long one), `AUTH_SECRET` (any long random string), your model API keys, and the four GitHub values. Deploy.

Open the URL on your phone, enter the password, and add it to your home screen.

---

## Overnight

Select rows, tap **Overnight ½**, close the laptop. The English goes to Anthropic's batch queue; when it lands, the French batch is submitted automatically; when that lands, the covers are queued and generated a few at a time. All of it is driven by `/api/cron`, so it only runs while something calls that route: set the Supabase schedule (every 10 minutes) once and the whole chain works with the phone off.

```sql
-- Supabase → Database → Extensions: enable pg_cron and pg_net. Then, with your real URL:
select cron.schedule('mt-writer-poll', '*/10 * * * *',
  $$ select net.http_get(url := 'https://YOUR-APP.vercel.app/api/cron'); $$);
```

## Notes on the plumbing

- **Security**: one password, an HTTP-only cookie, checked on every route. The Supabase service key and the model keys never leave the server. The site is `noindex`.
- **Timeouts**: writing one article takes 30–90 seconds, which fits inside a Vercel function. For large selections use **Batch**, which returns immediately and is collected later — it has no timeout and costs half.
- **Cron**: `vercel.json` polls open batches hourly. On the free plan Vercel allows one cron a day, which is why the app also polls whenever you open it. Nothing is lost either way.
- **Editing**: an article you edit is marked, and a regeneration will refuse to overwrite it unless you use *regenerate* inside the article sheet.
- **Publishing** writes `content/en/blog/<slug>.md`, `content/fr/blog/<slug>.md` and `assets/covers/<slug>.jpg` to the site repo, one commit per file.

## Changing the writing

Everything the model reads lives in the `docs` table: `style`, `system_en`, `system_fr`, `image_style`, `facts`, `brand-book`, `example_*`. Edit them in the Supabase table editor — from the phone if you like — and the next article follows the new rules. `facts` is the only source of personal material; the writer is forbidden to invent anything beyond it.
