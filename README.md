# Maison Tarot — writer

A small local tool that writes the Maison Tarot blog: each article in English and in French, in the house voice, with front matter, section anchors, internal links that resolve on the site, and a cover-image prompt. It runs on your machine, in your browser, and writes Markdown files you drop into the Hugo project.

- **Plan**: `data/plan.csv` — 727 rows, one per article, both languages, with slugs, statuses and your notes.
- **Output**: `out/content/en/blog/` and `out/content/fr/blog/`, plus `out/assets/covers/`.
- **To publish**: drag `out/content` and `out/assets` over `C:\Projets\mt`, then commit.

---

## Install (once)

1. Install Python 3.10 or later from <https://www.python.org/downloads/windows/>. Tick **"Add python.exe to PATH"** in the installer.
2. Close and reopen PowerShell (or VS Code), then:

```powershell
cd C:\Projets\mt-writer
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

If `Activate.ps1` is refused, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

3. Copy `.env.example` to `.env` and paste your API key(s) into it. The tool reads that file at start, so nothing has to be typed again.

---

## Run

```powershell
cd C:\Projets\mt-writer
.venv\Scripts\Activate.ps1
python app.py
```

A browser tab opens at <http://localhost:8765>. The terminal shows the server; Ctrl+C stops it. Nothing is lost when you stop — the plan and the articles are files on disk.

---

## How to use it

1. **Prepare titles** — once. Fills in the missing counterpart for every row: the French title, keyword and slug for rows that began in English, and the English ones for rows that began in French. Both languages then share one `translationKey`, which is how the site pairs them. Costs a few cents. Edit anything it proposed in `data/plan.csv` before generating.
2. **Filter and select.** Search, filter by category or status, then tick rows or use *select all shown*.
3. **Write notes** in the last column. They are saved as you type and they outrank every other instruction in the prompt. This is where your stories, corrections and angles go.
4. **Generate EN**, **FR**, or **both**. Two articles are written in parallel; the log on the right shows progress. A ⚠ in a status column means the file was written but something failed validation — hover to see what.
5. **Read the files** in `out/`. If you edit one by hand, the tool will never overwrite it; *Regenerate (force)* does.
6. **Generate covers** when the text is done (see below).

---

## Choosing the model

The header has a provider menu — Anthropic, OpenAI, Google — and a model field with suggestions. Type any model ID your key has access to. Keys go in `.env`: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`.

The rules, the facts file and the validation are identical whichever model writes. Only Anthropic models get prompt caching, so the others cost a little more per article.

---

## Covers

**Generate covers** takes the `imagePrompt` that the writer put in each article's front matter, calls an image model, and saves `out/assets/covers/SLUG.jpg` at 1600×1200. Both language files are pointed at the same image — one cover per article pair.

- Provider: Google by default (`GEMINI_API_KEY`), or set `MT_IMAGE_PROVIDER=openai` in `.env`.
- Put a photo you like at `notes/reference.jpg` and the Google model matches its style on every cover. This is the surest way to make four hundred images look like one site.
- Roughly $0.04 an image.
- Run twenty first and look at them together. If the style is off, adjust `prompts/image_style.md` or swap the reference photo, then run twenty more. Only run the rest when twenty in a row look right.

**Export image prompts** writes `data/image_prompts.csv` (id, slug, prompt, alt text, destination folders) if you'd rather generate elsewhere.

---

## Cost

Roughly $0.25–0.45 per article pair with a top model, less with a cheaper one. Useful levers:

- Draft with a cheap model, regenerate the keepers with a strong one.
- `MT_WORKERS=1` in `.env` to go one at a time (default 2).
- `MT_DRY_RUN=1` runs the whole pipeline without calling any API — useful for testing the interface.

---

## What's in the folder

| Path | What it is |
| --- | --- |
| `data/plan.csv` | The plan. One row per article, both languages, slugs, statuses, your notes. The source of truth — edit it freely (in Excel, save as CSV UTF-8). |
| `data/site_paths.json` | Every page on the site and the English↔French pairs. Links are validated against this plus the plan, so an article never links to a page that will not exist. |
| `prompts/style.md` | How an article is written: voice, structure, links, banned words. Edit this to change the writing. |
| `prompts/system_fr.md` | The French brief — an adaptation with French idioms and references, not a translation. |
| `prompts/image_style.md` | How a cover prompt is built: specific subject, fixed style suffix, fixed negative list. |
| `notes/facts.md` | The only source of personal material. The writer is forbidden to invent anything beyond it; add your stories here. |
| `notes/brand-book.md` | The brand book, read on every call. |
| `notes/example_*.md` | Articles used as style examples. Swap them for your favourites as the site grows. |
| `build_plan.py` | Rebuilds the plan and the path map. Run only after the site gains new sections. |

---

## Notes

- `.env`, `.venv/`, `out/` and `data/state.json` are excluded from git. Your API key stays on your machine.
- The tool writes articles only. Card pages, library pages and city pages are part of the site, not of this tool.
