# Cover image prompts — the rules that keep 400 images looking like one site

Every article gets ONE cover prompt in its front matter (`imagePrompt:`), used for both languages. It is built from three parts, in this order:

1. **The subject** — specific to the article, one scene, one idea, describable in one sentence. Photographic, real-world, editorial. Prefer: a table, hands, a card or a deck, a notebook, a window, a chair, a doorway, a phone, a street, a kitchen. People are candid and never looking at the camera; no faces that would need to be a real person. The subject must make sense to someone who hasn't read the article.
   - For articles about a specific card: the card itself, upright, whole, in colour, on a plain surface (the card is artwork and stays in colour).
   - For sceptic/ethics/scam articles: an object that carries the idea (a folded banknote under a candle; a phone face down; a door ajar).
   - For stories: the setting of the story, no reenactment of people.
   - For astrology: a printed chart, a pencil, a window at night — never a galaxy, never constellations drawn over a face.
2. **The fixed style suffix**, verbatim: `Editorial photograph, 35mm, natural light from one window, shallow depth of field, black and white with strong contrast and light film grain, plain background, no text, no logo, 4:3.`
   - Exception for card covers: `…, the card in its original colours, everything else black and white, …`
3. **The negative list**, verbatim: `No candles, crystals, incense, smoke, moons, stars, galaxies, hands hovering over cards, purple light, crystal balls, mystical props, watermarks, text.`

Rules:
- One sentence for the subject, then the two fixed blocks. Never restate the article title in the prompt.
- The same prompt serves EN and FR; the FR file copies it unchanged.
- The `imageAlt` field describes the resulting photo in plain words, for screen readers, in the article's language. It is not the prompt.
- Consistency comes from the fixed suffix and negative list: do not improvise style words (moody, cinematic, dreamy, magical).
